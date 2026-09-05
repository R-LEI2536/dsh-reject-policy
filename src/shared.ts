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
 */

/** settings 中的 mode 闭值。'stop' = 改文案 + 停 turn；'default' = 仅改文案（若配置）。 */
export type RejectMode = 'default' | 'stop'

/** 列出可广告的 mode 值，给设置 UI / 命令校验用。 */
export const REJECT_MODES: readonly RejectMode[] = ['default', 'stop']

/** settings 段：mode + 触发 tool 列表。运行时可改。 */
export interface RejectPolicySettings {
  /** 'stop' = 改文案 + 停 turn；'default' = 仅改文案（若配置）。 */
  mode: RejectMode
  /** 触发本插件行为的 tool 名列表；空 = 全部。 */
  stopOnRejectTools: string[]
}

/** settings 命名空间；host `installSection` 和 client slot key 共用。 */
export const REJECT_POLICY_SETTINGS_NAMESPACE = 'reject-policy' as const