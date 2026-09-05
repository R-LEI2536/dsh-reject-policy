/**
 * reject-policy — 自有 reject 行为插件（不进 packages/）。
 *
 * 在 settings 的 `mode` 下，覆盖官方 serviceAsk 的 reject 文本与 turn 收尾：
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
 * @module plugin-reject-policy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { PostToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { RejectMode, RejectPolicySettings } from './shared'
import { REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE } from './shared'

/** Re-export the pure type / constant surface so existing `import { RejectMode } from 'dsh-reject-policy'`
 *  consumers keep working without reaching into `./shared` directly. */
export { REJECT_MODES, REJECT_POLICY_SETTINGS_NAMESPACE }
export type { RejectMode, RejectPolicySettings }

/**
 * Augment `@deepseek-ai/cordis` Context with the `settings` service.
 *
 * Inside the deepseek-harness monorepo this augmentation lives in
 * `packages/settings/settings/src/index.ts`. External plugins loading
 * `@deepseek-ai/cordis` from npm do not transitively see it; declare
 * the surface we actually consume.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    settings: {
      installSection<const T>(
        owner: Context,
        ns: string,
        schema: z<T>,
        entry: T,
        hooks: {
          setSource: (current: () => T) => void
          onChange: () => void
        },
      ): void
    }
  }
}

export const name = 'reject-policy'

/** 插件 cordis.yml 配置。 */
export interface Config {
  /** 触发本插件行为的 tool 名列表；空数组表示所有被拒 tool 都触发。默认：[] */
  stopOnRejectTools?: string[]
  /** 按 tool 名覆盖拒绝时返回给模型的文本。默认：{}（使用官方原文） */
  messages?: Record<string, string>
  /** 未在 messages 中命中的 tool 使用的模板，支持 `{tool}` / `{name}` 占位。默认：undefined */
  defaultMessage?: string
}

/** schemastery schema：cordis.yml 装载阶段校验。 */
export const Config: z<Config> = z.object({
  stopOnRejectTools: z.array(z.string()).default([]),
  messages: z.dict(z.string()).default({}),
  defaultMessage: z.string().required(false),
})

/** 官方 serviceAsk 的拒因模板（packages/core/tools/src/index.ts:1707）。 */
export const OFFICIAL_REJECTION_TEMPLATE = 'the user rejected tool "{name}"'

/**
 * 解析一个 tool 的最终拒因：messages[name] → defaultMessage（带占位替换）→ undefined。
 * @param cfg - 已 normalize 的 cordis.yml 配置（messages / defaultMessage）。
 * @param toolName - 被拒的 tool 名。
 * @returns 替换文本；undefined 表示沿用官方原文。
 */
export function resolveMessage(
  cfg: { messages?: Record<string, string>; defaultMessage?: string },
  toolName: string,
): string | undefined {
  const fromMap = cfg.messages?.[toolName]
  if (typeof fromMap === 'string' && fromMap.length > 0) return fromMap
  const template = cfg.defaultMessage
  if (typeof template === 'string' && template.length > 0) {
    return template.replaceAll('{tool}', toolName).replaceAll('{name}', toolName)
  }
  return undefined
}

/** 每个 session 的"待停"标记。WeakMap：session 销毁时自动回收。 */
const stopPending = new WeakMap<Session, true>()
/** 测试 / 外部观察用：判断某 session 是否已置停。 */
export function isStopPending(session: Session): boolean { return stopPending.get(session) === true }
/** 测试 / 外部观察用：显式清除某 session 的待停标记。 */
export function clearStopPending(session: Session): void { stopPending.delete(session) }

/**
 * 判断检测：result 是 serviceAsk 生成的拒绝结果。匹配
 * `packages/core/tools/src/index.ts:1707` 写出的 `the user rejected tool "X"`。
 */
function isRejectionResult(toolName: string, result: ToolExecutionResult): boolean {
  if (!result.isError) return false
  const message = result.error?.message
  return message === OFFICIAL_REJECTION_TEMPLATE.replace('{name}', toolName)
}

/** apply — 插件装载入口。注册 post-execute 改写与 pre-step 置停两个 waterfall。 */
export function apply(ctx: Context, config: Config): void {
  // exactOptionalPropertyTypes: omit `defaultMessage` when undefined so the
  // resulting cfg type matches resolveMessage's `defaultMessage?: string`.
  const cfg: {
    stopOnRejectTools: string[]
    messages: Record<string, string>
    defaultMessage?: string
  } = {
    stopOnRejectTools: config.stopOnRejectTools ?? [],
    messages: config.messages ?? {},
    ...(config.defaultMessage !== undefined ? { defaultMessage: config.defaultMessage } : {}),
  }
  // settings thunk：当前生效的 mode + 触发列表。每次 settings 写入后被替换。
  let settingsRef: () => RejectPolicySettings = () => ({
    mode: 'stop' as RejectMode,
    stopOnRejectTools: cfg.stopOnRejectTools,
  })

  /** 当前模式。mode='default' 时不置停；mode='stop' 时置停。 */
  const currentMode = (): RejectMode => settingsRef().mode
  /** 工具是否在本插件的触发范围内（与 mode 解耦：mode 只决定是否置停）。 */
  const inScope = (toolName: string): boolean => {
    const list = settingsRef().stopOnRejectTools
    return list.length === 0 || list.includes(toolName)
  }

  // ── tools/post-execute：命中拒绝结果 → 改文案 + 可选置停 ─────────────
  // post-execute 的 next() 仅产出一个 PostToolDecision；result 是只读的原始结果。
  // 本 listener 检测原始 result 是否是 serviceAsk 的拒因，命中则：
  //   1) 用配置文本走 block 改写错误结果；
  //   2) 当 mode='stop' 时在 WeakMap 置 session 的待停标记。
  ctx.on('tools/post-execute', async (
    exec: ToolExecution,
    result: Readonly<ToolExecutionResult>,
    next: () => Promise<PostToolDecision>,
  ): Promise<PostToolDecision> => {
    if (exec.agent === undefined) return await next()
    if (!inScope(exec.name)) return await next()
    if (!isRejectionResult(exec.name, result)) return await next()

    // 改写错误文本。resolveMessage 返回 undefined 时，仍走 block 但沿用原文——
    // 这样 mode='stop' + 无文案配置 也能置停（用户只想要停，不要改文案）。
    const overridden = resolveMessage(cfg, exec.name)
    const text = overridden ?? result.error!.message
    const mode = currentMode()

    // mode='stop' 时置 session 待停：下一轮 agent/pre-step 会被关掉。
    if (mode === 'stop') stopPending.set(exec.agent.session, true)

    return {
      kind: 'block',
      feedback: [{ type: 'text', text }],
    }
  })

  // ── agent/pre-step：检测待停标记 → 返回 reject ─────────────────────────
  // 返回 reject 让 ReactLoopAgent.turn() 设 turnEnds = { kind: 'blocked' } 并退出
  // turn。同轮并行的其他 tool 已经 commit，模型看不到新一轮请求。
  ctx.on('agent/pre-step', async (
    payload: { agent: Agent },
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    const session = payload.agent.session
    if (!isStopPending(session)) return await next()
    // 用完即清：避免后续无 reject 的 step 也被关掉。
    stopPending.delete(session)
    return { kind: 'reject' }
  })

  // ── settings：mode + 触发列表 走 settings.installSection ───────────────
  const settingsSchema: z<RejectPolicySettings> = z.object({
    mode: z.union([...REJECT_MODES] as RejectMode[]).required(),
    stopOnRejectTools: z.array(z.string()).required(),
  })
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, REJECT_POLICY_SETTINGS_NAMESPACE, settingsSchema, {
      mode: 'stop',
      stopOnRejectTools: cfg.stopOnRejectTools,
    }, {
      setSource: (current: () => RejectPolicySettings) => { settingsRef = current },
      onChange: () => {},
    })
  })
}