# DESIGN — `plugin-reject-policy`

> 防止后续忘了这份设计与权衡。把所有目标、决策、边界、未决项都放这里。

## 1. 目标

覆盖官方 `serviceAsk` 拒绝后的两条路径——**denial 文本**与**turn 收尾**——且不修改官方源码。

| 用户原始需求 | 落地方式 |
|---|---|
| 设置里开关 reject 行为 | 插件 Config 的 volatile 字段（entry id `reject-policy`）：Plugins 页 row Configure 或 `ctx.settings.update` 编辑 `mode` + `stopOnRejectTools` |
| 拒绝后停当前 turn | `mode='stop'` + `agent/pre-step` 返回 `kind: 'reject'`，turn 以 `kind: 'blocked'` 关闭 |
| 停哪些 tool 可配 | `stopOnRejectTools: string[]`，空数组 = 全部 |
| reject 文案可配 | `messages[name]` 精确覆盖；`defaultMessage` 模板兜底（`{tool}` / `{name}`） |

## 2. mode 与文案的 2×2 表

| mode | 文案配置 | 行为 |
|---|---|---|
| `default` | 无 | **官方原版**（无任何改动） |
| `default` | 有 | **官方行为 + 自定义文案**（模型继续） |
| `stop` | 无 | **仅停 turn**（沿用官方文案） |
| `stop` | 有 | **自定义文案 + 停 turn** |

用户明确要求"返回官方原版"也必须支持 → 第一行；用户明确要求"在 default DSH 下改文案"也必须支持 → 第二行。

## 3. 实现机制（三个 listener）

```
[serviceAsk] → deny: message="the user rejected tool "X""
                     info={ name: 'ApprovalError', code: 'APPROVAL_REJECTED' }   ← 0.2.2-rc.3+；唯一信号，老宿主无 info（不支持）
        ↓
[materializeFinalResult] → result.error.message / result.error.info
        ↓
[tools/post-execute waterfall]
        ↓ (我们的 listener)
        ├─ exec.agent === undefined → next() 透传
        ├─ !inScope(exec.name) → next() 透传
        ├─ !isRejectionResult(...) → next() 透传   ← info 是唯一信号
        └─ 命中：
              ├─ resolveMessage(cfg, exec.name) 决定新文本
              ├─ mode === 'stop' → WeakMap<Session, true>.set(session, true)
              └─ return { kind: 'block', feedback: [{ type: 'text', text }], info }   ← 透传上游 info
        ↓
[registry postExecute] → 用新文案重做错误结果（带上 info）

[下一轮 agent/pre-step waterfall]
        ↓ (我们的 listener)
        ├─ !isStopPending(session) → next() 透传
        └─ 命中 → WeakMap.delete(session) + return { kind: 'reject' }
        ↓
[ReactLoopAgent.turn()] → turnEnds = { kind: 'blocked' }，return false
```

## 4. 检测：结构化身份（唯一信号）

0.2.2-rc.3 起上游在拒绝结果上写**会持久化**的结构化身份：

```typescript
// packages/core/tools/src/error-codes.ts:9-12
APPROVAL_ERROR_NAME = 'ApprovalError'
APPROVAL_REJECTED = 'APPROVAL_REJECTED'
// packages/core/tools/src/pipeline.ts:468
decision: approvalDenial(`the user rejected tool "${exec.name}"`, APPROVAL_REJECTED)
// → 结果落盘为 error: { message: '…', info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' } }
```

`isRejectionResult` 只比 `error.info`：

```typescript
const info = result.error?.info
return info?.name === APPROVAL_ERROR_NAME && info.code === APPROVAL_REJECTED
```

- **只认 `APPROVAL_REJECTED`**：`APPROVAL_CANCELLED`（用户取消审批弹窗）和
  `APPROVAL_UNAVAILABLE`（没有可用审批通道）都不是「用户拒绝」——既不改写，
  也不停 turn。
- **老宿主明确不支持**（2026-11 与用户对齐）：`0.2.1-rc.*` / `0.2.2-rc.1`–rc.2
  的**审批拒绝结果**不带 `error.info`（其它失败路径自 rc.1 起就可能带 `info`），
  info-only 检测在这些宿主上恒为 false；peer 已同步收窄到 `^0.2.2-rc.3`，
  这些宿主在 boot 兼容门禁即被拒，装不上。原先的字面文案兜底
  （`OFFICIAL_REJECTION_TEMPLATE` 全串相等）已移除：文案是写给人读的、不是
  程序契约，且它与 `ci:drift` 的前缀断言不对称——上游在文案**尾部**追加文字时
  守卫全绿、运行时静默失效。与其修补对齐，不如整条删掉。
- **身份字符串的耦合点**：`ApprovalError` / `APPROVAL_REJECTED` 是持久化契约、
  上游不 re-export，本插件本地复刻；`ci:drift` 对这两个字符串各持一条断言
  （候选首推 `src/error-codes.ts`，发布产物走 `lib/*.js` 兜底扫描）。上游改
  name 或 code → `ci:drift` 红 → 同步 `src/index.ts`。
- **为什么透传 `info`**：rc.3 的 registry 用 block 的 feedback 重建失败结果
  （`pipeline.ts:501-505`），不带 `info` 就等于把上游刚加的结构化身份丢掉；
  `PostToolDecision.block.info` 正是为此新增的。
- **为什么仍然改写 `message`**：`ToolErrorInfo.reason` 的注释明确「model-facing
  content does not include it」——结构化通道不达模型，改文案仍是唯一办法。

## 5. 为什么用 `agent/pre-step` reject 而不是 abort signal

| 方案 | turn end reason | 同轮并行 tool | 语义 |
|---|---|---|---|
| `agent/pre-step` reject（采用） | `blocked` | 都跑完，结果进 log | "deliberate stop"，用户否决 |
| abort agent signal | `aborted` | 中断，记为 skippedToolCall | "cancellation"，混淆用户否决 vs 取消 |

用户的明确要求：同轮并行的其他 tool 要跑完 → 选前者。

## 6. 配置分层

```
cordis.yml patch（bundle 继承层 + profile user 层，reload/volatile-update 生效）：
  mode?: 'default' | 'stop'     # volatile——运行时可改，默认 'stop'
  stopOnRejectTools?: string[]  # volatile——运行时可改，默认 []
  messages?: Record<string, string>     # 一次性交付，非 volatile
  defaultMessage?: string               # 一次性交付，非 volatile
```

DSH 0.1.7 起：`mode` / `stopOnRejectTools` 声明为 Config schema 的
`.volatile()` 字段，运行时编辑（Plugins 页 row Configure 或
`ctx.settings.update('reject-policy', {...})`）写入 `<profile>/cordis.patch.yml`；
Loader `_commitVolatile` 原地更新 volatile 引用（不重挂），本插件两个
listener 事件时读 `config.mode.get()` / `config.stopOnRejectTools.get()`，
无需订阅 `loader/volatile-update`。

**为什么文案不进 volatile**：拒绝文本是一次性交付，不是 live rule。运行时改"下一次拒绝用什么文本"语义模糊（沿用旧取舍）。

## 7. 文件清单

```
plugin-reject-policy/
├── DESIGN.md                  ← 本文档
├── README.md                  ← 用户视角：模式表 + 配置 + 协同关系 + 已知限制
├── cordis.patch.yml           ← 发布 patch（dsh.bundle.patch 指向此）
├── src/index.ts               ← 函数插件（name / Config / apply，无 default export）
└── tests/reject-policy-check.mts  ← 25 条断言（8 组）全过
```

## 8. 验证状态

> 当前验证状态（0.5.3，DSH `0.2.2-rc.3` devDeps）见 `CHANGELOG.md` 的 0.5.3
> 节；下表混有 0.3.0（0.1.7-rc.2 对齐）开发期的记录，测试条数已按当前值更新。
> 0.3.0 的真机消费侧验证见
> [UPGRADE-0.1.7-LESSONS.md](./UPGRADE-0.1.7-LESSONS.md) §2 验证矩阵。

| 检查 | 状态 |
|---|---|
| `tests/reject-policy-check.mts` | ✅ 27/27（info-only 检测起；0.5.3 为 25/25） |
| `pnpm run typecheck` / `typecheck:client` | ✅ 0.5.3 起实跑通过（0.3.0 开发期因 shell sandbox 未跑） |
| `pnpm run ci:drift` | ✅ 断言双身份契约：`ApprovalError` 名 + `APPROVAL_REJECTED` 码（0.5.3 曾为文案前缀 + code） |
| `scratch-plugin/tests/smoke-apply.mts`、`gate-check.mts` | ✅ 0.3.0 开发期通过（已不在本仓库） |
| `pnpm --filter @deepseek-ai/dsh-agent-loop test` | — 不再适用（本仓库不是 monorepo 子包） |

## 9. 已知限制 / 后续要看的点

1. **身份字符串与上游耦合**：检测唯一信号是上游持久化的 `ApprovalError` / `APPROVAL_REJECTED`（本地复刻、不 import），上游改任一字符串检测即静默失效——`ci:drift`（挂在 `test` / `build`）是唯一守护。老宿主（`0.2.1-rc.*` / `0.2.2-rc.1`–rc.2）审批拒绝不带 `info`，明确不支持：peer 收窄到 `^0.2.2-rc.3`，boot 门禁直接拒绝安装。
2. **文案不进 settings**：和用户对齐过的取舍，不是 bug。
3. **plugin 路径不在 `packages/`**：因为是部署侧 composition，不属于官方包。
4. **不在 agent loop 之外的 bash 工具调用上生效**：harness 自己的 bash 工具不走 agent loop，本插件看不到。

## 10. 替代方案（被否决的）

| 方案 | 否决原因 |
|---|---|
| 改 `packages/core/tools/src/index.ts` `serviceAsk` | 越过"packages/ 是官方包"的边界；每个下游消费者都得 opt-in |
| "hide + stop" 模式（拒绝结果不进 log） | log 是 replay/调试的唯一来源，藏起来会丢失；"tell + stop" 已足够 |
| abort agent signal | turn end = aborted；语义混淆；打断并行 tool |
| 字面兜底改 startsWith 前缀匹配 | 仍守「文案」这个非契约信号，且只在老宿主上有意义——老宿主改由明确不支持（2026-11 与用户对齐），比修补对齐更干净 |
| hook `approval/request` 改 reason | `serviceAsk` 的 reason 是硬编码模板，不是 approval outcome，无法在 hook 层改 |
| 用 `error.info.reason` 代替改 `error.message` | 上游 `ToolErrorInfo.reason` 注释明确「model-facing content does not include it」——模型看不到，达不到"改模型可见拒因"的目的 |
| 文案进 settings | 一次性的文案没有"live rule"语义；运行时改没清晰含义 |
| 三 mode 设置（default/tell/stop） | tell 一旦文案配置就跟 default 重合，没必要单设 |

## 11. 后续对齐清单（恢复 shell 后）

- 跑 `pnpm run typecheck` 验证全仓库类型
- 跑 `pnpm --filter @deepseek-ai/dsh-agent-loop test` 验证 pre-step reject 契约未变
- 写 `.zh.md` 配套（如果项目需要双语）