/**
 * reject-policy-check — 自有 reject-policy 插件的最小冒烟测试。
 *
 * 不依赖真实 approval / agent-loop：用 cordis Context + 假 ctx.plugin mount，
 * 然后调用 ctx.waterfall('tools/post-execute', ...) 与 ctx.waterfall('agent/pre-step', ...)
 * 模拟一次拒绝结果 + 下一轮 pre-step，断言本插件产出与预期一致。
 *
 * DSH 0.1.7：`mode` / `stopOnRejectTools` 是插件 Config 的 volatile 字段，
 * 运行时改动走「写 volatile 引用」路径——这正是 Loader `_commitVolatile`
 * （loader/volatile-update）在生产环境做的事。测试用 cosmokit 的内部写
 * 协议（`Symbol.for('cosmokit.volatile.write')`）把 `fiber.config` 上的
 * 引用原地更新，插件的事件时 `.get()` 随即读到新值，无需任何订阅。
 *
 * 覆盖 18 条断言：
 *   1. mode='default' + 无文案配置 → 结果透传（无 flag、无文案改写）。
 *   2. mode 默认 'stop' + messages.bash → 文案改写 + flag。
 *   3. mode='stop' + messages.bash → 文案改写 + flag 置位 + pre-step 返回 reject。
 *   4. mode='stop' + stopOnRejectTools=['read'] → bash 被拒不触发停（无 flag）。
 *   5. mode='stop' + defaultMessage='permission denied for {tool}' → 模板替换。
 *   6. 运行时改 volatile mode='default' → 后续拒绝回到"仅改文案"。
 *   7. resolveMessage 纯函数单测。
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

const makeRejectionResult = (toolName: string) => ({
  isError: true as const,
  error: { message: mod.OFFICIAL_REJECTION_TEMPLATE.replace('{name}', toolName) },
  content: [{ type: 'text' as const, text: `Error: ${mod.OFFICIAL_REJECTION_TEMPLATE.replace('{name}', toolName)}` }],
})

// ── 工具：装载插件 + 返回 ctx/setConfig ─────────────────────────────────
async function mount(config: Parameters<typeof mod.apply>[1]): Promise<{
  ctx: Context
  // 运行时改 volatile Config：等价于 profile patch 写入后的 `_commitVolatile`。
  setConfig: (patch: VolatilePatch) => void
}> {
  const ctx = new Context()
  const fiber = await ctx.plugin(mod, config)
  return {
    ctx,
    setConfig: (patch) => {
      if (patch.mode !== undefined) writeVolatile(fiber.config.mode, patch.mode)
      if (patch.stopOnRejectTools !== undefined) writeVolatile(fiber.config.stopOnRejectTools, patch.stopOnRejectTools)
    },
  }
}

// ── 工具：模拟一次工具拒绝 → 走 post-execute waterfall ─────────────────────
async function runRejection(
  ctx: Context,
  toolName: string,
): Promise<{ errorMessage: string | undefined; flagged: boolean }> {
  const exec = makeExec(toolName)
  const result = makeRejectionResult(toolName)
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

if (failures > 0) {
  console.error(`\n${failures} CHECK(S) FAILED`)
  process.exitCode = 1
} else {
  console.log('\nALL CHECKS PASSED')
}