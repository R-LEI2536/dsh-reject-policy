/**
 * reject-policy — 自有 reject 行为插件（不进 packages/）。
 *
 * 在插件 Config 的 volatile `mode` 字段下，覆盖官方 serviceAsk 的 reject
 * 文本与 turn 收尾：
 *
 * - `mode='default'` + 无文案配置：本插件对结果不做任何修改，等同于官方原版。
 * - `mode='default'` + 配置了 `messages` / `defaultMessage`：改写错误文本，
 *   但**不**置停 turn（模型继续，行为是 DSH 原版）。
 * - `mode='stop'`：改写错误文本，并置停 turn 标记；下一轮 `agent/pre-step`
 *   返回 `kind: 'reject'`，turn 以 `turn/end { kind: 'blocked' }` 关闭，
 *   LLM 不再被调用。
 *
 * 文案覆盖永远生效（mode 与文案无关）。`messages[name]` 优先；否则用
 * `defaultMessage`（支持 `{tool}` / `{name}` 占位）；都没有则保留官方原文。
 *
 * `stopOnRejectTools` 控制哪些被拒 tool 触发本插件行为；空数组表示全部。
 *
 * DSH 0.1.7：`mode` 与 `stopOnRejectTools` 是 Config 的 volatile 字段——
 * 表单写入 profile patch（`configEditor`），Loader 经 `_commitVolatile`
 * 原地更新 volatile 引用并发出 `loader/volatile-update`（不重挂）。本插件的
 * 两个 listener 都是事件时读 `config.mode.get()` / `config.stopOnRejectTools.get()`，
 * 因此无需订阅 `loader/volatile-update` 即可看到最新值。
 * `messages` / `defaultMessage` 保持非 volatile（一次性交付的文案，不是 live rule）。
 *
 * @module plugin-reject-policy
 */
import z from '@deepseek-ai/schemastery';
import { REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE } from './shared';
/** Re-export the pure type / constant surface so existing `import { RejectMode } from 'dsh-reject-policy'`
 *  consumers keep working without reaching into `./shared` directly. */
export { REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE };
export const name = 'reject-policy';
/**
 * schemastery schema：cordis.yml 装载阶段校验。volatile 字段 = 运行时可编辑面。
 *
 * 不加 `z<Config>` 标注：schema 的输入形状（原始值）与输出形状（volatile 引用）
 * 不同，`exactOptionalPropertyTypes` 下单一类型参数无法同时绑定两者；因此值绑定
 * `z<RuntimeConfig>`（输出侧描述，d.ts 可移植），公开契约由上面的 `Config`
 * （patch 输入）与 `RuntimeConfig`（apply 输入）两个接口表达。
 */
export const Config = z.object({
    mode: z.union([...REJECT_MODES]).default('stop').volatile(),
    stopOnRejectTools: z.array(z.string()).default([]).volatile(),
    messages: z.dict(z.string()).default({}),
    defaultMessage: z.string().required(false),
});
/** 官方 serviceAsk 的拒因模板（packages/core/tools/src/index.ts:1755）。 */
export const OFFICIAL_REJECTION_TEMPLATE = 'the user rejected tool "{name}"';
/**
 * 解析一个 tool 的最终拒因：messages[name] → defaultMessage（带占位替换）→ undefined。
 * @param cfg - 已 normalize 的 cordis.yml 配置（messages / defaultMessage）。
 * @param toolName - 被拒的 tool 名。
 * @returns 替换文本；undefined 表示沿用官方原文。
 */
export function resolveMessage(cfg, toolName) {
    const fromMap = cfg.messages?.[toolName];
    if (typeof fromMap === 'string' && fromMap.length > 0)
        return fromMap;
    const template = cfg.defaultMessage;
    if (typeof template === 'string' && template.length > 0) {
        return template.replaceAll('{tool}', toolName).replaceAll('{name}', toolName);
    }
    return undefined;
}
/** 每个 session 的"待停"标记。WeakMap：session 销毁时自动回收。 */
const stopPending = new WeakMap();
/** 测试 / 外部观察用：判断某 session 是否已置停。 */
export function isStopPending(session) { return stopPending.get(session) === true; }
/** 测试 / 外部观察用：显式清除某 session 的待停标记。 */
export function clearStopPending(session) { stopPending.delete(session); }
/**
 * 判断检测：result 是 serviceAsk 生成的拒绝结果。匹配
 * `packages/core/tools/src/index.ts:1755` 写出的 `the user rejected tool "X"`。
 */
function isRejectionResult(toolName, result) {
    if (!result.isError)
        return false;
    const message = result.error?.message;
    return message === OFFICIAL_REJECTION_TEMPLATE.replace('{name}', toolName);
}
/** apply — 插件装载入口。注册 post-execute 改写与 pre-step 置停两个 waterfall。 */
export function apply(ctx, config) {
    // 一次性提示：拒因检测靠 OFFICIAL_REJECTION_TEMPLATE 字面相等，上游改前缀
    // 会让本插件静默失效。用户如果发现配置不灵了，跑 `pnpm ci:drift` 自查。
    console.warn('[dsh-reject-policy] detection matches OFFICIAL_REJECTION_TEMPLATE literally. ' +
        'If you upgrade DSH and overrides silently stop working, run `pnpm ci:drift` to verify upstream has not drifted.');
    // 非 volatile 文案配置：patch 变更走 Loader 整行重挂，apply 会重新捕获，
    // 因此这里快照一次即可；volatile 字段经 `.get()` 事件时读。
    // exactOptionalPropertyTypes: omit `defaultMessage` when undefined so the
    // resulting cfg type matches resolveMessage's `defaultMessage?: string`.
    const cfg = {
        messages: config.messages ?? {},
        ...(config.defaultMessage !== undefined ? { defaultMessage: config.defaultMessage } : {}),
    };
    /** 当前模式：volatile Config，事件时读最新值（loader/volatile-update 原地更新）。 */
    const currentMode = () => config.mode.get();
    /** 工具是否在本插件的触发范围内（与 mode 解耦：mode 只决定是否置停）。 */
    const inScope = (toolName) => {
        const list = config.stopOnRejectTools.get();
        return list.length === 0 || list.includes(toolName);
    };
    // ── tools/post-execute：命中拒绝结果 → 改文案 + 可选置停 ─────────────
    // post-execute 的 next() 仅产出一个 PostToolDecision；result 是只读的原始结果。
    // 本 listener 检测原始 result 是否是 serviceAsk 的拒因，命中则：
    //   1) 用配置文本走 block 改写错误结果；
    //   2) 当 mode='stop' 时在 WeakMap 置 session 的待停标记。
    ctx.on('tools/post-execute', async (exec, result, next) => {
        if (exec.agent === undefined)
            return await next();
        if (!inScope(exec.name))
            return await next();
        if (!isRejectionResult(exec.name, result))
            return await next();
        // 改写错误文本。resolveMessage 返回 undefined 时，仍走 block 但沿用原文——
        // 这样 mode='stop' + 无文案配置 也能置停（用户只想要停，不要改文案）。
        const overridden = resolveMessage(cfg, exec.name);
        const text = overridden ?? result.error.message;
        const mode = currentMode();
        // mode='stop' 时置 session 待停：下一轮 agent/pre-step 会被关掉。
        if (mode === 'stop')
            stopPending.set(exec.agent.session, true);
        return {
            kind: 'block',
            feedback: [{ type: 'text', text }],
        };
    });
    // ── agent/pre-step：检测待停标记 → 返回 reject ─────────────────────────
    // 返回 reject 让 ReactLoopAgent.turn() 设 turnEnds = { kind: 'blocked' } 并退出
    // turn。同轮并行的其他 tool 已经 commit，模型看不到新一轮请求。
    ctx.on('agent/pre-step', async (payload, next) => {
        const session = payload.agent.session;
        if (!isStopPending(session))
            return await next();
        // 用完即清：避免后续无 reject 的 step 也被关掉。
        stopPending.delete(session);
        return { kind: 'reject' };
    });
    // ── settings：注册自定义页面策略，禁止为 reject-policy 自动生成表单 ────
    // 本插件的配置页面是 Plugins 页的 `plugins.row.config`（见 src/client/），
    // 与 ui-theme 等自带定制页的插件一致，声明 auto: false。
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
}
//# sourceMappingURL=index.js.map