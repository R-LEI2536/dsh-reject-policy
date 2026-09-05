# DESIGN — `plugin-reject-policy`

> 防止后续忘了这份设计与权衡。把所有目标、决策、边界、未决项都放这里。

## 1. 目标

覆盖官方 `serviceAsk` 拒绝后的两条路径——**denial 文本**与**turn 收尾**——且不修改官方源码。

| 用户原始需求 | 落地方式 |
|---|---|
| 设置里开关 reject 行为 | settings namespace `reject-policy`，暴露 `mode` + `stopOnRejectTools` |
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
[serviceAsk] → deny: "the user rejected tool "X""
        ↓
[materializeFinalResult] → result.error.message === 'the user rejected tool "X"'
        ↓
[tools/post-execute waterfall]
        ↓ (我们的 listener)
        ├─ exec.agent === undefined → next() 透传
        ├─ !inScope(exec.name) → next() 透传
        ├─ !isRejectionResult(...) → next() 透传
        └─ 命中：
              ├─ resolveMessage(cfg, exec.name) 决定新文本
              ├─ mode === 'stop' → WeakMap<Session, true>.set(session, true)
              └─ return { kind: 'block', feedback: [{ type: 'text', text }] }
        ↓
[registry postExecute] → 用新文案重做错误结果

[下一轮 agent/pre-step waterfall]
        ↓ (我们的 listener)
        ├─ !isStopPending(session) → next() 透传
        └─ 命中 → WeakMap.delete(session) + return { kind: 'reject' }
        ↓
[ReactLoopAgent.turn()] → turnEnds = { kind: 'blocked' }，return false
```

## 4. 检测的硬编码

```typescript
const OFFICIAL_REJECTION_TEMPLATE = 'the user rejected tool "{name}"'
```

匹配 `result.error.message === OFFICIAL_REJECTION_TEMPLATE.replace('{name}', exec.name)`。

**耦合点**：`packages/core/tools/src/index.ts:1716` 的官方原文改了，本常量必须同步更新。

## 5. 为什么用 `agent/pre-step` reject 而不是 abort signal

| 方案 | turn end reason | 同轮并行 tool | 语义 |
|---|---|---|---|
| `agent/pre-step` reject（采用） | `blocked` | 都跑完，结果进 log | "deliberate stop"，用户否决 |
| abort agent signal | `aborted` | 中断，记为 skippedToolCall | "cancellation"，混淆用户否决 vs 取消 |

用户的明确要求：同轮并行的其他 tool 要跑完 → 选前者。

## 6. 配置分层

```
cordis.yml patch（reload 生效）：
  stopOnRejectTools: string[]    # 哪些 tool 触发本插件
  messages: Record<string, string> # 按 tool 名覆盖文案
  defaultMessage?: string          # 模板兜底

settings（运行时可改，命名空间 reject-policy）：
  mode: 'default' | 'stop'
  stopOnRejectTools: string[]
```

**为什么文案不进 settings**：拒绝文本是一次性交付，不是 live rule。运行时改"下一次拒绝用什么文本"语义模糊。

## 7. 文件清单

```
plugin-reject-policy/
├── DESIGN.md                  ← 本文档
├── README.md                  ← 用户视角：模式表 + 配置 + 协同关系 + 已知限制
├── cordis.patch.yml           ← 发布 patch（dsh.bundle.patch 指向此）
├── src/index.ts               ← 函数插件（name / Config / apply，无 default export）
└── tests/reject-policy-check.mts  ← 18 条断言全过
```

## 8. 验证状态

| 检查 | 状态 |
|---|---|
| `plugin-reject-policy/tests/reject-policy-check.mts` | ✅ 18/18 通过（settings API 迁移到 `installSection` 后重跑验证） |
| `scratch-plugin/tests/smoke-apply.mts` | ✅ 通过 |
| `scratch-plugin/tests/gate-check.mts` | ✅ 通过 |
| `pnpm run typecheck` | ⏸ 未跑（shell sandbox 拒了 `bash`） |
| `pnpm --filter @deepseek-ai/dsh-agent-loop test` | ⏸ 未跑（同上） |

## 9. 已知限制 / 后续要看的点

1. **OFFICIAL_REJECTION_TEMPLATE 与官方文本耦合**：官方改文案 → 这里必须改。
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
| 文案进 settings | 一次性的文案没有"live rule"语义；运行时改没清晰含义 |
| 三 mode 设置（default/tell/stop） | tell 一旦文案配置就跟 default 重合，没必要单设 |

## 11. 后续对齐清单（恢复 shell 后）

- 跑 `pnpm run typecheck` 验证全仓库类型
- 跑 `pnpm --filter @deepseek-ai/dsh-agent-loop test` 验证 pre-step reject 契约未变
- 写 `.zh.md` 配套（如果项目需要双语）