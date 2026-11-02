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
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Session } from '@deepseek-ai/dsh-session';
import type { RejectMode, RejectPolicySettings } from './shared';
import { REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE } from './shared';
/** Re-export the pure type / constant surface so existing `import { RejectMode } from 'dsh-reject-policy'`
 *  consumers keep working without reaching into `./shared` directly. */
export { REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE };
export type { RejectMode, RejectPolicySettings };
export declare const name = "reject-policy";
/**
 * 部署方 patch 输入形状（`cordis.patch.yml` 的 config 段，全部可选）。与
 * 0.2.2 的公开 `Config` 类型形状一致；schema 校验后 apply 收到的是
 * {@link RuntimeConfig}（volatile 字段包在 `Volatile<T>` 引用里）。
 */
export interface Config {
    /** 'stop' = 改文案 + 停 turn；'default' = 仅改文案（若配置）。默认：'stop' */
    mode?: RejectMode;
    /** 触发本插件行为的 tool 名列表；空数组表示所有被拒 tool 都触发。默认：[] */
    stopOnRejectTools?: string[];
    /** 按 tool 名覆盖拒绝时返回给模型的文本。默认：{}（使用官方原文） */
    messages?: Record<string, string>;
    /** 未在 messages 中命中的 tool 使用的模板，支持 `{tool}` / `{name}` 占位。 */
    defaultMessage?: string;
}
/**
 * 运行时解析后的 Config（`resolveConfig` 输出）：`mode` / `stopOnRejectTools`
 * 是 volatile 引用（live，随 profile user 层经 `loader/volatile-update` 原地
 * 更新），其余字段为启动时定值的普通值。`apply` 按此形状读配置。
 *
 * 注意：schemastery `required(false)` 的输出类型把 `defaultMessage` 标为必填，
 * 但补丁未配置时运行期解析结果仍是 `undefined`（apply 已防御性处理）。
 */
export interface RuntimeConfig {
    mode: Volatile<RejectMode>;
    stopOnRejectTools: Volatile<string[]>;
    messages: Record<string, string>;
    defaultMessage: string;
}
/**
 * schemastery schema：cordis.yml 装载阶段校验。volatile 字段 = 运行时可编辑面。
 *
 * 不加 `z<Config>` 标注：schema 的输入形状（原始值）与输出形状（volatile 引用）
 * 不同，`exactOptionalPropertyTypes` 下单一类型参数无法同时绑定两者；因此值绑定
 * `z<RuntimeConfig>`（输出侧描述，d.ts 可移植），公开契约由上面的 `Config`
 * （patch 输入）与 `RuntimeConfig`（apply 输入）两个接口表达。
 */
export declare const Config: z<RuntimeConfig>;
/** 官方 serviceAsk 的拒因模板（packages/core/tools/src/index.ts:1755）。 */
export declare const OFFICIAL_REJECTION_TEMPLATE = "the user rejected tool \"{name}\"";
/**
 * 解析一个 tool 的最终拒因：messages[name] → defaultMessage（带占位替换）→ undefined。
 * @param cfg - 已 normalize 的 cordis.yml 配置（messages / defaultMessage）。
 * @param toolName - 被拒的 tool 名。
 * @returns 替换文本；undefined 表示沿用官方原文。
 */
export declare function resolveMessage(cfg: {
    messages?: Record<string, string>;
    defaultMessage?: string;
}, toolName: string): string | undefined;
/** 测试 / 外部观察用：判断某 session 是否已置停。 */
export declare function isStopPending(session: Session): boolean;
/** 测试 / 外部观察用：显式清除某 session 的待停标记。 */
export declare function clearStopPending(session: Session): void;
/** apply — 插件装载入口。注册 post-execute 改写与 pre-step 置停两个 waterfall。 */
export declare function apply(ctx: Context, config: RuntimeConfig): void;
//# sourceMappingURL=index.d.ts.map