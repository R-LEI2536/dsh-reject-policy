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
                     info={ name: 'ApprovalError', code: 'APPROVAL_REJECTED' }   ← 0.2.2-rc.3+；旧宿主只有 message
        ↓
[materializeFinalResult] → result.error.message / result.error.info
        ↓
[tools/post-execute waterfall]
        ↓ (我们的 listener)
        ├─ exec.agent === undefined → next() 透传
        ├─ !inScope(exec.name) → next() 透传
        ├─ !isRejectionResult(...) → next() 透传   ← info 优先，字面量兜底
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

## 4. 检测：结构化身份优先 + 字面量兜底

0.2.2-rc.3 起上游在拒绝结果上写**会持久化**的结构化身份：

```typescript
// packages/core/tools/src/error-codes.ts:9-12
APPROVAL_ERROR_NAME = 'ApprovalError'
APPROVAL_REJECTED = 'APPROVAL_REJECTED'
// packages/core/tools/src/pipeline.ts:468
decision: approvalDenial(`the user rejected tool "${exec.name}"`, APPROVAL_REJECTED)
// → 结果落盘为 error: { message: '…', info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' } }
```

`isRejectionResult` 先比 `error.info`，未命中再比字面量：

```typescript
const info = result.error?.info
if (info?.name === APPROVAL_ERROR_NAME && info.code === APPROVAL_REJECTED) return true
return result.error?.message === OFFICIAL_REJECTION_TEMPLATE.replace('{name}', toolName)
```

- **只认 `APPROVAL_REJECTED`**：`APPROVAL_CANCELLED`（用户取消审批弹窗）和
  `APPROVAL_UNAVAILABLE`（没有可用审批通道）都不是「用户拒绝」——既不改写，
  也不停 turn。
- **为什么保留兜底**：peer 仍覆盖 `0.2.1-rc.*` / `0.2.2-rc.1`，这些宿主不写
  `error.info`，同一份产物要两边都能用。
- **兜底的耦合点**：`OFFICIAL_REJECTION_TEMPLATE` 与官方原文耦合——
  0.2.2-rc.3 在 `pipeline.ts:468`（rc.1 为 `:460`，发布产物 `lib/pipeline.js`，
  `@deepseek-ai/dsh-tools/pipeline` 子入口）；旧训练在 `index.ts:1755` /
  `1763`。行号只用于定位，`ci:drift` 断言的是稳定字面前缀。
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
└── tests/reject-policy-check.mts  ← 24 条断言（8 组）全过
```

## 8. 验证状态

> 下表为开发期的仓库内验证；0.3.0（0.1.7-rc.2 对齐）的真机消费侧验证见
> [UPGRADE-0.1.7-LESSONS.md](./UPGRADE-0.1.7-LESSONS.md) §2 验证矩阵。

| 检查 | 状态 |
|---|---|
| `plugin-reject-policy/tests/reject-policy-check.mts` | ✅ 18/18 通过（settings API 迁移到 `installSection` 后重跑验证） |
| `scratch-plugin/tests/smoke-apply.mts` | ✅ 通过 |
| `scratch-plugin/tests/gate-check.mts` | ✅ 通过 |
| `pnpm run typecheck` | ⏸ 未跑（shell sandbox 拒了 `bash`） |
| `pnpm --filter @deepseek-ai/dsh-agent-loop test` | ⏸ 未跑（同上） |

## 9. 已知限制 / 后续要看的点

1. **字面量兜底仍与官方文本耦合**：0.2.2-rc.3+ 靠结构化 `error.info` 判断，上游改文案不再致命；但 `0.2.1-rc.*` / `0.2.2-rc.1` 宿主只能走字面量，那时官方改文案 → `OFFICIAL_REJECTION_TEMPLATE` 必须同步（`ci:drift` 会红）。
2. **文案不进 settings**：和用户对齐过的取舍，不是 bug。
3. **plugin 路径不在 `packages/`**：因为是部署侧 composition，不属于官方包。
4. **不在 agent loop 之外的 bash 工具调用上生效**：harness 自己的 bash 工具不走 agent loop，本插件看不到。

## 10. 替代方案（被否决的）

| 方案 | 否决原因 |
|---|---|
| 改 `packages/core/tools/src/index.ts` `serviceAsk` | 越过"packages/ 是官方包"的边界；每个下游消费者都得 opt-in |
| "hide + stop" 模式（拒绝结果不进 log） | log 是 replay/调试的唯一来源，藏起来会丢失；"tell + stop" 已足够 |
| abort agent signal | turn end = aborted；语义混淆；打断并行 tool |
| hook `approval/request` 改 reason | `serviceAsk` 的 reason 是硬编码模板，不是 approval outcome，无法在 hook 层改 |
| 用 `error.info.reason` 代替改 `error.message` | 上游 `ToolErrorInfo.reason` 注释明确「model-facing content does not include it」——模型看不到，达不到"改模型可见拒因"的目的 |
| 文案进 settings | 一次性的文案没有"live rule"语义；运行时改没清晰含义 |
| 三 mode 设置（default/tell/stop） | tell 一旦文案配置就跟 default 重合，没必要单设 |

## 11. 后续对齐清单（恢复 shell 后）

- 跑 `pnpm run typecheck` 验证全仓库类型
- 跑 `pnpm --filter @deepseek-ai/dsh-agent-loop test` 验证 pre-step reject 契约未变
- 写 `.zh.md` 配套（如果项目需要双语）