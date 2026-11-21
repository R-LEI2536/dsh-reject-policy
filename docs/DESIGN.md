# DESIGN — `plugin-reject-policy`

> 防止后续忘了这份设计与权衡。把所有目标、决策、边界、未决项都放这里。

## 1. 目标

覆盖官方 `serviceAsk` 拒绝后的两条路径——**denial 文本**与**turn 收尾**——且不修改官方源码。

| 用户原始需求 | 落地方式 |
|---|---|
| 设置里开关 reject 行为 | 插件 Config 的 volatile 字段（entry id `reject-policy`）：composer dock 常驻开关、Plugins 页 row Configure、或 `ctx.settings.update` 编辑 `mode` + `stopOnRejectTools` |
| 拒绝后停当前 turn | `mode='stop'` + `agent/pre-step` 返回 `kind: 'reject'`，turn 以 `kind: 'blocked'` 关闭 |
| 停哪些 tool 可配 | `stopOnRejectTools: string[]`，空数组 = 全部 |
| reject 文案可配 | `messages[name]` 精确覆盖；`defaultMessage` 模板兜底（`{tool}` / `{name}`） |
| mode 开关别埋在设置里（2026-11-21 用户要求） | 客户端 `RejectPolicyDock`：注册进 `conversation.input.dock`（composer 上方 dock 条，与 Todo/Goal/Queue 同族），显示实时 mode 并点击原地切换 |

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
`.volatile()` 字段，运行时编辑（composer dock 开关、Plugins 页 row Configure
或 `ctx.settings.update('reject-policy', {...})`）写入 `<profile>/cordis.patch.yml`；
Loader `_commitVolatile` 原地更新 volatile 引用（不重挂），本插件两个
listener 事件时读 `config.mode.get()` / `config.stopOnRejectTools.get()`，
无需订阅 `loader/volatile-update`。

**为什么文案不进 volatile**：拒绝文本是一次性交付，不是 live rule。运行时改"下一次拒绝用什么文本"语义模糊（沿用旧取舍）。

## 7. composer dock 常驻开关（客户端第二界面）

2026-11-21 用户要求：mode 开关不能埋在设置里——藏在 Plugins → Configure → Save
两层导航后面，会话中途实际不可达。落地为 `RejectPolicyDock`
（`src/client/RejectPolicyDock.tsx`），注册进 `conversation.input.dock`
（Todo 0 / Goal 10 / Queue 20 同族；本插件 order 15，位于 Goal 与 Queue 之间——Queue 必须保持最末条目，它的负 margin 贴底接缝不容后来者），
显示实时 `mode`，单击原地切换 `stop ↔ default`，无导航无 Save。

关键取舍：

- **单一数据源**：dock 不自建订阅，绑 `ctx.configForms.get('reject-policy')`
  （per-namespace 缓存 → 与 Plugins 页卡片是同一个 form 实例，见
  `src/client/index.ts` 注释）。读写同一条 describe mirror、同一条 Host 写
  队列，两个界面不可能分歧；卡片的 `ConfigPageForm` 只是页面注入的包装，
  底层同源。
- **原地切换，无 staged Save**：`mode` 是 per-task 运行时规则，不是安装配置；
  staged 语义会把一键开关再次变远（见 §11 否决的 staged 方案）。写失败不
  假装成功：inline `role="alert"` 提示 + 可重试。
- **回 base 即 unset**：点回 composition `base` 时发 `unset('mode')` 清掉
  user override，不写冗余覆盖——与卡片 Save 的同一规则。
- **可见性门控**：Host 不服务 namespace（`configForms.whileServed`）则整条
  不注册；describe mirror 首个 section 未到（`status !== 'ready'`）渲染
  null。liveshare 非 owner：`settings/describe` 本身就是 owner-only
  （`endpoint-classification.ts:111`），describe 失败 → mirror 无 view →
  `whileServed` 永不注册——dock 与卡片一样**整条不存在**；「绕开
  `pluginManager/listBundles` 门」只是绕开了 Plugins 页那道门，没绕开
  settings 这道。`writable=false` 分支（可见但 inert + readOnly tooltip）
  是给只读 settings provider 预留的防御路径，当前上游 provider 恒
  `writable=true`。
- **粒度没变**：dock 只是把入口搬进会话；写仍是 profile patch
  （`<profile>/cordis.patch.yml`），profile 级共享，不是 per-session。

## 8. 文件清单

```
plugin-reject-policy/
├── DESIGN.md                  ← 本文档
├── README.md                  ← 用户视角：模式表 + 三种编辑入口 + 协同关系 + 已知限制
├── cordis.patch.yml           ← 发布 patch（dsh.bundle.patch 指向此）
├── src/index.ts               ← host 半（name / Config / apply，无 default export）
├── src/shared.ts              ← 纯类型/常量面（host/client 共享，零运行时 import）
├── src/client/index.ts        ← client 半：注册 Plugins 页卡片 + composer dock
├── src/client/RejectPolicyCard.tsx / .module.css   ← Plugins 页配置卡片
├── src/client/RejectPolicyDock.tsx / .module.css  ← composer dock 常驻开关
├── src/client/locales.ts      ← en/zh 文案（卡片 + dock 同 namespace）
├── tsdown.config.ts           ← host/client 两个 bundle + CSS Modules inline
└── tests/reject-policy-check.mts  ← 27 条断言（8 组）全过
```

## 9. 验证状态

> 当前验证状态（0.6.0，DSH `0.2.2-rc.3` devDeps）见 `CHANGELOG.md` 的 0.6.0
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
| composer dock 分支门禁（typecheck / typecheck:client / ci:drift / 27 断言 / worktree 本地 build + bundle 纯度） | ✅ 2026-11-22 分支收尾快照全过；最终 `lib/` 由 main checkout 重建后单独提交（CSS-module hash 绑定源文件绝对路径） |

## 10. 已知限制 / 后续要看的点

1. **身份字符串与上游耦合**：检测唯一信号是上游持久化的 `ApprovalError` / `APPROVAL_REJECTED`（本地复刻、不 import），上游改任一字符串检测即静默失效——`ci:drift`（挂在 `test` / `build`）是唯一守护。老宿主（`0.2.1-rc.*` / `0.2.2-rc.1`–rc.2）审批拒绝不带 `info`，明确不支持：peer 收窄到 `^0.2.2-rc.3`，boot 门禁直接拒绝安装。
2. **文案不进 settings**：和用户对齐过的取舍，不是 bug。
3. **plugin 路径不在 `packages/`**：因为是部署侧 composition，不属于官方包。
4. **不在 agent loop 之外的 bash 工具调用上生效**：harness 自己的 bash 工具不走 agent loop，本插件看不到。
5. **dock 写的仍是 profile patch，不是 per-session**：入口搬进了会话，粒度没变——mode 是 profile 级设置，多会话/多窗口共享。
6. **liveshare 非 owner 看不到 dock（与卡片一致）**：`settings/describe` 是 owner-only（`endpoint-classification.ts:111`），非 owner 的 describe 失败 → `whileServed` 永不注册，整条不存在；`writable=false` 的「可见但 inert」是只读 provider 的预留防御路径（当前上游恒 `writable=true`），不是已触发的行为。

## 11. 替代方案（被否决的）

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
| mode 入口只留 Plugins 页卡片 | 开关埋在 Plugins → Configure → Save 两层导航后面，会话中途实际不可达——2026-11-21 用户否决，dock 的立项原因 |
| dock 内做 staged Save/Discard | mode 是 per-task 运行时规则不是安装配置；staged 把一键切换变三步，把开关再次变远 |
| dock 里放 select 下拉 | 只有两档，下拉多一次瞄准与展开；pill + 单击更低摩擦 |
| dock 自建 settings 订阅绕过 configForms | 会造出第二条读写路径，与卡片可能分歧；必须共享同一 `ConfigForm`（`configForms.get` per-namespace 缓存 → 同实例） |

## 12. 后续对齐清单（恢复 shell 后）

- 跑 `pnpm run typecheck` 验证全仓库类型
- 跑 `pnpm --filter @deepseek-ai/dsh-agent-loop test` 验证 pre-step reject 契约未变
- 写 `.zh.md` 配套（如果项目需要双语）