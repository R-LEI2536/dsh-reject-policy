import z from "@deepseek-ai/schemastery";
// lib/types/shared.js
/**
* shared — type / constant surface consumed by BOTH the host half
* (`src/index.ts`) and the client half (`src/client/`).
*
* ZERO runtime imports: no `@deepseek-ai/schemastery`, no `@deepseek-ai/cordis`,
* no anything with side effects. This file is safe to import from the client
* bundle; tsdown will follow the import and inline only what `shared.ts`
* actually pulls in. The client bundle purity gate fails if `shared.ts` ever
* gains a runtime dependency on a non-EXTERNAL package, because the loader's
* module table only answers the EXTERNAL list.
*
* Concretely, the client bundle has a runtime `require("@deepseek-ai/schemastery")`
* trap if the client reaches into `src/index.ts` for any of these. Keep
* everything the client needs here instead.
*
* DSH 0.1.7: the runtime-editable surface moved from the old `settings`
* installSection namespace to the plugin entry's volatile Config fields. The
* settings namespace id is now the profile patch entry id (`id:` in
* `cordis.patch.yml`). All of these must stay the same string:
*   - `REJECT_POLICY_SETTINGS_NAMESPACE` (configForms entry id / patch row id)
*   - `REJECT_POLICY_PACKAGE_NAME` (bundle package name)
*   - the `#`-joined `plugins.row.config` key this package registers.
*/
/** 列出可广告的 mode 值，给设置 UI / 命令校验用。 */
const REJECT_MODES = ["default", "stop"];
/** settings 命名空间 / profile patch 行 id / configForms entry id；三者共用。 */
const REJECT_POLICY_SETTINGS_NAMESPACE = "reject-policy";
// lib/types/index.js
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
const name = "reject-policy";
/**
* schemastery schema：cordis.yml 装载阶段校验。volatile 字段 = 运行时可编辑面。
*
* 不加 `z<Config>` 标注：schema 的输入形状（原始值）与输出形状（volatile 引用）
* 不同，`exactOptionalPropertyTypes` 下单一类型参数无法同时绑定两者；因此值绑定
* `z<RuntimeConfig>`（输出侧描述，d.ts 可移植），公开契约由上面的 `Config`
* （patch 输入）与 `RuntimeConfig`（apply 输入）两个接口表达。
*/
const Config = z.object({
	mode: z.union([...REJECT_MODES]).default("stop").volatile(),
	stopOnRejectTools: z.array(z.string()).default([]).volatile(),
	messages: z.dict(z.string()).default({}),
	defaultMessage: z.string().required(false)
});
/**
* 审批拒绝结果的结构化身份（0.2.2-rc.3+）。上游不 re-export 这两个字符串
* （`error-codes.ts` 的注释是「the values are persisted contract … consumers
* compare the recorded strings」），所以按持久化契约值本地复刻，不 import；
* `pnpm ci:drift`（`scripts/check-official-template.ts`）对这两个字符串各持
* 一条断言，是本地复刻与上游保持同步的守护。
*/
const APPROVAL_ERROR_NAME = "ApprovalError";
const APPROVAL_REJECTED = "APPROVAL_REJECTED";
/**
* 解析一个 tool 的最终拒因：messages[name] → defaultMessage（带占位替换）→ undefined。
* @param cfg - 已 normalize 的 cordis.yml 配置（messages / defaultMessage）。
* @param toolName - 被拒的 tool 名。
* @returns 替换文本；undefined 表示沿用官方原文。
*/
function resolveMessage(cfg, toolName) {
	const fromMap = cfg.messages?.[toolName];
	if (typeof fromMap === "string" && fromMap.length > 0) return fromMap;
	const template = cfg.defaultMessage;
	if (typeof template === "string" && template.length > 0) return template.replaceAll("{tool}", toolName).replaceAll("{name}", toolName);
}
/** 每个 session 的"待停"标记。WeakMap：session 销毁时自动回收。 */
const stopPending = /* @__PURE__ */ new WeakMap();
/** 测试 / 外部观察用：判断某 session 是否已置停。 */
function isStopPending(session) {
	return stopPending.get(session) === true;
}
/** 测试 / 外部观察用：显式清除某 session 的待停标记。 */
function clearStopPending(session) {
	stopPending.delete(session);
}
/**
* 判断检测：result 是官方审批拒绝生成的拒绝结果。
*
* 只认 0.2.2-rc.3+ 写入并**持久化**的结构化身份 `error.info =
* { name: 'ApprovalError', code: 'APPROVAL_REJECTED' }`
* （`packages/core/tools/src/pipeline.ts:468` 的 `approvalDenial(...)` 写入）：
* 文案是写给人读的，`code` 才是给程序读的契约，上游改措辞不影响检测。
* 只认 `APPROVAL_REJECTED`——`APPROVAL_CANCELLED`（用户取消了审批弹窗）与
* `APPROVAL_UNAVAILABLE`（没有可用审批通道）都不是「用户拒绝」：既不改写，
* 也不停 turn。
*
* 老宿主（`0.2.1-rc.*` / `0.2.2-rc.1`–`rc.2`）的**审批拒绝结果**不带
* `error.info`（其它失败路径自 rc.1 起就可能带 `info`），info-only 检测在这些
* 宿主上恒为 false，插件不触发——老宿主明确不支持。原先的字面文案兜底
* （`OFFICIAL_REJECTION_TEMPLATE` 全串相等）已移除：文案不是程序契约，且
* 与 `ci:drift` 守卫的前缀断言不对称（上游在文案尾部追加文字时守卫全绿、
* 运行时静默失效）。身份字符串的漂移由 `pnpm ci:drift` 守护（断言 name 与
* code 两个字符串，见 `scripts/check-official-template.ts`）。
*/
function isRejectionResult(result) {
	if (!result.isError) return false;
	const info = result.error?.info;
	return info?.name === APPROVAL_ERROR_NAME && info.code === APPROVAL_REJECTED;
}
/** apply — 插件装载入口。注册 post-execute 改写与 pre-step 置停两个 waterfall。 */
function apply(ctx, config) {
	console.warn("[dsh-reject-policy] detection relies solely on the structured ApprovalError/APPROVAL_REJECTED identity (DSH 0.2.2-rc.3+; hosts whose approval denial carries no error.info are not supported). If overrides silently stop working, run `pnpm ci:drift` to verify upstream has not drifted.");
	const cfg = {
		messages: config.messages ?? {},
		...config.defaultMessage !== void 0 ? { defaultMessage: config.defaultMessage } : {}
	};
	/** 当前模式：volatile Config，事件时读最新值（loader/volatile-update 原地更新）。 */
	const currentMode = () => config.mode.get();
	/** 工具是否在本插件的触发范围内（与 mode 解耦：mode 只决定是否置停）。 */
	const inScope = (toolName) => {
		const list = config.stopOnRejectTools.get();
		return list.length === 0 || list.includes(toolName);
	};
	ctx.on("tools/post-execute", async (exec, result, next) => {
		if (exec.agent === void 0) return await next();
		if (!inScope(exec.name)) return await next();
		if (!isRejectionResult(result)) return await next();
		const text = resolveMessage(cfg, exec.name) ?? result.error.message;
		if (currentMode() === "stop") stopPending.set(exec.agent.session, true);
		const info = result.error?.info;
		return {
			kind: "block",
			feedback: [{
				type: "text",
				text
			}],
			...info === void 0 ? {} : { info }
		};
	});
	ctx.on("agent/pre-step", async (payload, next) => {
		const session = payload.agent.session;
		if (!isStopPending(session)) return await next();
		stopPending.delete(session);
		return { kind: "reject" };
	});
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
}
export { Config, REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE, apply, clearStopPending, isStopPending, name, resolveMessage };
