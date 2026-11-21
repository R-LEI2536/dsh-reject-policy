/**
 * reject-policy-check — 自有 reject-policy 插件的最小冒烟测试。
 *
 * 不依赖真实 approval / agent-loop：用 cordis Context + 假 ctx.plugin mount，
 * 然后调用 ctx.waterfall('tools/post-execute', ...) 与 ctx.waterfall('agent/pre-step', ...)
 * 模拟一次拒绝结果 + 下一轮 pre-step，断言本插件产出与预期一致。
 *
 * `mode` / `stopOnRejectTools` 是插件 Config 的 volatile 字段，运行时改动走
 * 「写 volatile 引用」路径——这正是 Loader `_commitVolatile`
 * （loader/volatile-update）在生产环境做的事。测试用 cosmokit 的内部写协议
 * （`Symbol.for('cosmokit.volatile.write')`）把解析后 Config 上的引用原地更新，
 * 插件的事件时 `.get()` 随即读到新值，无需任何订阅。
 *
 * cordis 4.1.0 起 `fiber.config` 只保留**原始输入**，schema 解析后的 Config 改从
 * `fiber.effectiveConfig` 读取（Loader 的 `_commitVolatile` 同样改走这里，见
 * `vendor/loader/src/config/entry.ts`）。测试必须照此取引用，否则 4.1.0 下
 * `fiber.config.mode` 是 undefined。
 *
 * 覆盖 27 条断言：
 *   1. mode='default' + 无文案配置 → 结果透传（无 flag、无文案改写）。
 *   2. mode 默认 'stop' + messages.bash → 文案改写 + flag。
 *   3. mode='stop' + messages.bash → 文案改写 + flag 置位 + pre-step 返回 reject。
 *   4. mode='stop' + stopOnRejectTools=['read'] → bash 被拒不触发停（无 flag）。
 *   5. mode='stop' + defaultMessage='permission denied for {tool}' → 模板替换。
 *   6. 运行时改 volatile mode='default' → 后续拒绝回到"仅改文案"。
 *   7. resolveMessage 纯函数单测。
 *   8. 结构化身份：error.info 是唯一检测信号（文案漂移仍命中、透传 info、
 *      APPROVAL_CANCELLED / APPROVAL_UNAVAILABLE 不算拒绝、无 info 的老宿主
 *      一律不触发）。
 */

import { Context } from '@deepseek-ai/cordis'

const mod = await import('../src/index.ts')

let failures = 0
const expect = (label: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

type RejectMode = 'default' | 'stop'
type VolatilePatch = { mode?: RejectMode; stopOnRejectTools?: string[] }

/** 模拟 Loader `_commitVolatile`：把新值写进运行的 volatile 引用（cosmokit 内写协议，
 *  与 `updateVolatile` 落的是同一个 `Symbol.for('cosmokit.volatile.write')`）。 */
function writeVolatile(ref: object, value: unknown): void {
  const writable = ref as { [key: symbol]: (value: unknown) => void }
  writable[Symbol.for('cosmokit.volatile.write')](value)
}
// ── 共用工厂：构造一个 session 形状与 tool exec 形状 ─────────────────────────
const session: { __id: symbol } = { __id: Symbol('session') }
// 用鸭子类型注入；plugin 不读 session 字段，只做 WeakMap key + 传引用。
import type { Session } from '@deepseek-ai/dsh-session'
const fakeSession = session as unknown as Session

const makeExec = (name: string) => ({
  name,
  arguments: {},
  callId: `call-${name}`,
  agent: { session: fakeSession },
  signal: new AbortController().signal,
  token: Symbol('token'),
})

/** 0.2.2-rc.3+ 拒绝结果携带的结构化身份（info-only 检测的唯一信号）。 */
const APPROVAL_INFO = { name: 'ApprovalError', code: 'APPROVAL_REJECTED' } as const

const makeRejectionResult = (
  toolName: string,
  extra: { message?: string; info?: { name: string; code: string } | null } = {},
) => {
  // 默认模拟 0.2.2-rc.3+：拒绝结果带 error.info 结构化身份；文案与检测无关，
  // 默认取官方原文只为逼真。info: null 模拟老宿主（0.2.1-rc.* /
  // 0.2.2-rc.1–rc.2，审批拒绝不带 info）——插件对这些宿主不触发。
  const info = extra.info === undefined ? APPROVAL_INFO : extra.info
  const message = extra.message ?? `the user rejected tool "${toolName}"`
  return {
    isError: true as const,
    error: { message, ...(info === null ? {} : { info }) },
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
  }
}

// ── 工具：装载插件 + 返回 ctx/setConfig ─────────────────────────────────
async function mount(config: Parameters<typeof mod.apply>[1]): Promise<{
  ctx: Context
  // 运行时改 volatile Config：等价于 profile patch 写入后的 `_commitVolatile`。
  setConfig: (patch: VolatilePatch) => void
}> {
  const ctx = new Context()
  const fiber = await ctx.plugin(mod, config)
  // cordis 4.1.0: resolved (schema-applied) config lives on `effectiveConfig`,
  // not on the raw-input `config` field. The Loader's `_commitVolatile` reads it
  // from the same place.
  const resolved = fiber.effectiveConfig as Parameters<typeof mod.apply>[1]
  return {
    ctx,
    setConfig: (patch) => {
      if (patch.mode !== undefined) writeVolatile(resolved.mode, patch.mode)
      if (patch.stopOnRejectTools !== undefined) writeVolatile(resolved.stopOnRejectTools, patch.stopOnRejectTools)
    },
  }
}

// ── 工具：模拟一次工具拒绝 → 走 post-execute waterfall ─────────────────────
async function runRejection(
  ctx: Context,
  toolName: string,
  result: ReturnType<typeof makeRejectionResult> = makeRejectionResult(toolName),
): Promise<{
  errorMessage: string | undefined
  flagged: boolean
  info: { name: string; code: string } | undefined
}> {
  const exec = makeExec(toolName)
  // next() 默认走"accept"，下游不会改写——本测试只验证本插件的 listener 行为。
  const decision = await ctx.waterfall(
    ctx, 'tools/post-execute', exec, result,
    () => Promise.resolve({ kind: 'accept' as const }),
  )
  const errorMessage = decision.kind === 'block'
    ? decision.feedback.find((b: { type: string }) => b.type === 'text')?.text
    : result.error.message
  return {
    errorMessage,
    flagged: mod.isStopPending(fakeSession),
    info: decision.kind === 'block' ? decision.info : undefined,
  }
}

// ── 工具：模拟一次 agent/pre-step 推进 ─────────────────────────────────────
async function runPreStep(ctx: Context): Promise<{ kind: 'enter' | 'reject' }> {
  const decision = await ctx.waterfall(
    ctx, 'agent/pre-step', { agent: { session: fakeSession } },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  return { kind: decision.kind }
}

// ── 1) mode='default' + 无文案配置 → 透传 ───────────────────────────────────
{
  const { ctx, setConfig } = await mount({ stopOnRejectTools: [], messages: {} })
  // 运行时把 volatile mode 切到 'default'，验证"纯 DSH 原版"路径。
  setConfig({ mode: 'default' })
  const r = await runRejection(ctx, 'bash')
  expect('default+无配置 透传官方原文', r.errorMessage === 'the user rejected tool "bash"', `got=${r.errorMessage}`)
  expect('default+无配置 不置 flag', r.flagged === false)
}

// ── 2) mode 默认 'stop' + messages.bash → 改文案 + 置 flag ─────────────────
{
  const { ctx } = await mount({
    stopOnRejectTools: [],
    messages: { bash: 'permission denied by user' },
  })
  // mount 未配 mode：volatile default 为 'stop'。文案改写与 mode 无关。
  expect('默认 stop: 改写文案', (await runRejection(ctx, 'bash')).errorMessage === 'permission denied by user')
  expect('默认 stop: 置 flag', (await runRejection(ctx, 'bash')).flagged === true)
}

// ── 3) mode='stop' + messages.bash → 改文案 + flag + pre-step reject ─────────
{
  const { ctx } = await mount({ stopOnRejectTools: [], messages: { bash: 'permission denied by user' } })
  const r1 = await runRejection(ctx, 'bash')
  expect('stop+messages.bash 改写文案', r1.errorMessage === 'permission denied by user', `got=${r1.errorMessage}`)
  expect('stop+messages.bash 置 flag', r1.flagged === true)
  const r2 = await runPreStep(ctx)
  expect('flag 置位 → pre-step 返回 reject', r2.kind === 'reject', `got=${r2.kind}`)
  // 用完即清：再跑一次 pre-step 应放行
  const r3 = await runPreStep(ctx)
  expect('flag 用完即清 → 第二次 pre-step enter', r3.kind === 'enter', `got=${r3.kind}`)
}

// ── 4) mode='stop' + stopOnRejectTools=['read'] → bash 不触发停 ─────────────
{
  const { ctx, setConfig } = await mount({ stopOnRejectTools: ['read'] })
  setConfig({ mode: 'stop', stopOnRejectTools: ['read'] })
  mod.clearStopPending(fakeSession)
  const r = await runRejection(ctx, 'bash')
  expect('stopOnRejectTools=[read] bash 被拒不触发停（无 flag）', r.flagged === false)
  // 4b) read 被拒应触发停
  const r2 = await runRejection(ctx, 'read')
  expect('stopOnRejectTools=[read] read 被拒触发停', r2.flagged === true)
}

// ── 5) mode='stop' + defaultMessage 模板 ─────────────────────────────────────
{
  const { ctx } = await mount({
    stopOnRejectTools: [],
    defaultMessage: 'permission denied for {tool}',
  })
  const r = await runRejection(ctx, 'write')
  expect('defaultMessage 模板替换', r.errorMessage === 'permission denied for write', `got=${r.errorMessage}`)
  expect('defaultMessage 触发停', r.flagged === true)
}

// ── 6) 运行时改 volatile mode='default' → 后续拒绝仅改文案 ─────────────────
{
  const { ctx, setConfig } = await mount({
    stopOnRejectTools: [],
    messages: { bash: 'permission denied by user' },
  })
  setConfig({ mode: 'default' })
  mod.clearStopPending(fakeSession)
  const r = await runRejection(ctx, 'bash')
  expect('运行时 mode=default：改文案', r.errorMessage === 'permission denied by user', `got=${r.errorMessage}`)
  expect('运行时 mode=default：不置 flag', r.flagged === false)
  // 6b) 切回 stop 又能置 flag
  setConfig({ mode: 'stop' })
  mod.clearStopPending(fakeSession)
  const r2 = await runRejection(ctx, 'bash')
  expect('运行时切回 mode=stop：又置 flag', r2.flagged === true)
}

// ── 7) 辅助函数单元测试 ─────────────────────────────────────────────────────
{
  expect(
    'resolveMessage: messages[name] 优先',
    mod.resolveMessage({ messages: { bash: 'A' } }, 'bash') === 'A',
  )
  expect(
    'resolveMessage: defaultMessage 模板替换',
    mod.resolveMessage({ defaultMessage: 'denied for {tool}' }, 'write') === 'denied for write',
  )
  expect(
    'resolveMessage: 全空 → undefined',
    mod.resolveMessage({}, 'bash') === undefined,
  )
}

// ── 8) 结构化身份：error.info 是唯一检测信号 ───────────────────────────────
{
  const { ctx } = await mount({ stopOnRejectTools: [], messages: { bash: 'permission denied by user' } })

  // 8a) 上游改写了文案，但 info 仍是 ApprovalError/APPROVAL_REJECTED → 仍命中，
  //     且 block 决策把结构化身份透传给下游。
  mod.clearStopPending(fakeSession)
  const drifted = makeRejectionResult('bash', {
    message: 'The user denied the "bash" call.',
    info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' },
  })
  const r1 = await runRejection(ctx, 'bash', drifted)
  expect('info 命中：上游改文案仍改写', r1.errorMessage === 'permission denied by user', `got=${r1.errorMessage}`)
  expect(
    'info 命中：block 决策透传结构化身份',
    r1.info?.name === 'ApprovalError' && r1.info.code === 'APPROVAL_REJECTED',
    `got=${JSON.stringify(r1.info)}`,
  )
  expect('info 命中：仍置 flag', r1.flagged === true)

  // 8b) APPROVAL_CANCELLED（用户取消审批弹窗）不是"用户拒绝"：不改写、不停 turn。
  mod.clearStopPending(fakeSession)
  const cancelled = makeRejectionResult('bash', {
    message: 'approval for tool "bash" was cancelled',
    info: { name: 'ApprovalError', code: 'APPROVAL_CANCELLED' },
  })
  const r2 = await runRejection(ctx, 'bash', cancelled)
  expect('CANCELLED 不算拒绝：不改写文案', r2.errorMessage === 'approval for tool "bash" was cancelled', `got=${r2.errorMessage}`)
  expect('CANCELLED 不算拒绝：不置 flag', r2.flagged === false)

  // 8c) APPROVAL_UNAVAILABLE（没有可用审批通道）同样不是"用户拒绝"。
  mod.clearStopPending(fakeSession)
  const unavailable = makeRejectionResult('bash', {
    message: 'tool "bash" requires approval, but no approval channel is available',
    info: { name: 'ApprovalError', code: 'APPROVAL_UNAVAILABLE' },
  })
  const r3 = await runRejection(ctx, 'bash', unavailable)
  expect(
    'UNAVAILABLE 不算拒绝：不改写也不置 flag',
    r3.errorMessage === 'tool "bash" requires approval, but no approval channel is available' && r3.flagged === false,
  )

  // 8d) 无 info（老宿主 0.2.1-rc.* / 0.2.2-rc.1–rc.2）且文案已漂移 → 不触发。
  //     老宿主明确不支持：字面文案兜底已移除，文案不是信号。
  mod.clearStopPending(fakeSession)
  const noInfoDrifted = makeRejectionResult('bash', { message: 'The user denied the "bash" call.', info: null })
  const r4 = await runRejection(ctx, 'bash', noInfoDrifted)
  expect(
    '无 info：不触发（老宿主不支持）',
    r4.errorMessage === 'The user denied the "bash" call.' && r4.flagged === false,
  )

  // 8e) 无 info 且文案恰为官方原文 → 同样不触发：字面文案不再是检测信号
  //     （0.5.x 曾靠全串相等的字面兜底命中，行为自此改变）。
  mod.clearStopPending(fakeSession)
  const noInfoOfficial = makeRejectionResult('bash', { info: null })
  const r5 = await runRejection(ctx, 'bash', noInfoOfficial)
  expect('无 info + 官方原文：不改写', r5.errorMessage === 'the user rejected tool "bash"', `got=${r5.errorMessage}`)
  expect('无 info + 官方原文：不置 flag', r5.flagged === false)
}

if (failures > 0) {
  console.error(`\n${failures} CHECK(S) FAILED`)
  process.exitCode = 1
} else {
  console.log('\nALL CHECKS PASSED')
}