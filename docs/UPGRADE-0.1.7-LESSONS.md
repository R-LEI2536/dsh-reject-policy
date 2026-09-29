# UPGRADE 0.1.7-rc.2 — 经验教训（0.2.2 → 0.3.0）

> 迁移本体的改动见 `CHANGELOG.md` 0.3.0 条目与 git `5f25f89`；本文沉淀**迁移过程 + 真机验证**中踩过的坑、以及可复用的升级方法论。对照的规划文档是
> [`deepseek-harness/DSH-0.1.7-UPGRADE-PLAN.md`](../../deepseek-harness/DSH-0.1.7-UPGRADE-PLAN.md)（§2.2 / §3 / §4）。

## 1. 结论（TL;DR）

- 五个上游卡片（J1-04 volatile Config、J1-27 settingsScope→configForms、J1-31 settings.plugin.item 退役、J1-26 图标改名、J1-01 peer 范围）全部落地；仓库内验证通过后，**消费侧真机验证也全部通过**——这条升级路径完整成功。
- 最贵的三个坑：
  1. **cordis/schemastery 版本地板**（`^4.0.0`/`^3.0.0` 解析不到 `.volatile()`/`Volatile`）；
  2. **`exactOptionalPropertyTypes` 下 volatile 双面类型**（`Config`/`RuntimeConfig` 必须拆开标注）；
  3. **`settings.plugin.item` 退役的 UX 断层**（用户找不到"设置页入口"——是上游搬家，不是 bug，但要写进文档告诉用户）。
- 最有价值的方法论：**运行时判别**（用 session 日志格式判断 harness 版本、用 profile patch 落盘 + turn 边界做行为对照），以及**对照实验**证伪 harness 原生行为，避免"看起来生效了"的误判。

## 2. 真机验证矩阵（2026-09，`dev_web` profile，真实 GUI）

| # | 验证点 | 结果 | 证据 | 计划验证层（§4） |
|---|---|---|---|---|
| 1 | 服务端拒绝文本重写 | ✅ | 拒 bash 后返回文本与 `cordis.patch.yml#messages.bash` 逐字一致；且在 rc.2 全源码 grep `rejected your \w+ call` **零命中**（确认非 harness 原生模板） | 4 行为 |
| 2 | 空 `stopOnRejectTools` = 全部 tool 触发 | ✅ | `src/index.ts` 的 `list.length === 0 \|\| list.includes(name)`；bash 未列入也命中 | — |
| 3 | `mode='stop'` 停轮（默认值） | ✅ | echo 被拒后 turn 4 结束，用户必须新开 turn 5 才继续；`turnOutline` 显示 turn 边界 | 4 |
| 4 | Plugins 页 Configure 卡片可见 | ✅ | 用户实际找到 `plugins.row.config` 的 Configure 控件；`whileServed(['reject-policy'])` 门控通过（namespace 确实被 Host serve） | 3 表面 DOM |
| 5 | volatile 保存落盘 | ✅ | Save `mode: default` 后 `~/.dsh/profiles/dev_web/cordis.patch.yml` 出现 `mode: default`（行 346） | 4 设置写入 |
| 6 | 不重挂即生效 | ✅ | 同一进程内 `stop`→`default`：turn 8 内拒绝后**同轮继续回复**（`openStep` turn 8 step 4），对比 #3 的停轮；插件未重挂 | 3/4 |
| 7 | Settings 页老入口消失 | ✅ 预期内 | `settings.plugin.item` 上游退役（J1-31）；rc.2 Settings 页只剩只读 Plugins 清单 tab（`ui-settings-plugins` 只声明 `settings.section` + `settings.plugins.tab`） | — |

**运行时事实**（验证 #1–#7 的前提）：

- 插件运行链路：profile `node_modules/dsh-reject-policy` 是仓库的 `link:`，运行时解析的是仓库里**新构建的 `lib/`**（不是旧版包）。
- 运行中 harness 判定：当前会话日志是 `session.v4.jsonl.zstd`（v4 是 rc.2 的格式指纹，rc.2 自带 `migrate-sessions-to-v4`）；**全局 `dsh` CLI 仍是 0.1.5-rc.2**——判别运行中的版本要看会话格式/会话投影（projcache `version`），不能信 `dsh --version`。

## 3. 踩坑记录

### 3.1 cordis / schemastery 版本地板（最隐蔽）

- 现象：`^4.0.0`/`^3.0.0` 的 floor 解析到 `cordis@4.0.2` / `schemastery@3.18.2`，前者没有 `Volatile` 导出、后者没有 `.volatile()`；typecheck 与运行双双失败，且失败信息不带"版本地板"字样。
- 根因：rc.2 轨道的传递 peer 要求 `~4.0.4` / `~3.18.4`；pnpm 从 `^4.0.0` 解析的是 floor 而不是轨道。
- 修法：peer 显式抬到 `^4.0.4` / `^3.18.4`，**删 `pnpm-lock.yaml` 重装**（旧 lockfile 会把 4.0.2/3.18.2 钉死）。
- 教训：升级轨道前先 `pnpm view @deepseek-ai/cordis versions` / `pnpm view @deepseek-ai/schemastery versions` 与上游传递 peer 对齐，**别用 floor 版本的 `d.ts` 直觉推断 API**。

### 3.2 `exactOptionalPropertyTypes` × volatile 双面类型

- 现象（逐个排除）：
  - `export const Config = z.object({...}) as z<Config>` → TS2375（volatile schema 的输入=原始值、输出=`Volatile<T>`，一个 `z<>` 标注绑不住两面）；
  - 把 interface 全字段 required → 仍报 S 侧不匹配；
  - schema const 不写标注 → TS2742（`.d.ts` 要引用 `.pnpm/.../cosmokit` 路径，不可移植）。
- 修法：三种类型显式分工——`Config`（interface，patch 输入形状，全可选，与 0.2.2 兼容）、`RuntimeConfig`（interface，`apply` 入参，volatile 字段为 `Volatile<T>`）、schema const 标注 `as z<RuntimeConfig>`。
- 教训：`exactOptionalPropertyTypes` 下**破坏性类型变化要单独排雷**，typecheck 过了 ≠ 类型对了；不要"简化"回单一标注，会退回 TS2375/TS2742 二选一。

### 3.3 `settings.plugin.item` 退役的 UX 断层

- 现象：迁移后用户发现"原来设置页里能改设置，现在看不到了"。
- 真相：rc.2 上游把组合包配置统一搬到 **Plugins 页**（`plugins.item` / `plugins.bundle.config` / `plugins.row.config`）；Settings 页不再承载插件配置（`ui-settings-plugins` 只剩只读清单 tab）。
- 修法：迁移文档/CHANGELOG 必须写清**"入口搬家"**（用户视角），而不只是 API 替换清单（开发者视角）。新入口：Plugins 页 → `dsh-reject-policy` 行 → Configure。
- 附带：本插件对 `reject-policy` 声明 `settings.configure({ auto: false })`（与 ui-theme 等自定义页插件一致），Settings 页自动表单也不会出现——两件事叠加，用户视角就是"彻底消失"。

### 3.4 pnpm 11 安装怪癖（再次命中，已成惯例）

- `.npmrc` 的 `store-dir=.pnpm-store` 在全新安装时不一定生效，系统 store 只读会报 `ERR_PNPM_EROFS`；必须 CLI 传 `--store-dir=.pnpm-store`，且 `CI=true`（无 TTY 时 pnpm 拒绝重建 `node_modules`）。
- 已在 `AGENTS.md` 记录；本次升级再次验证。

### 3.5 "看起来生效了" ≠ "插件生效了"（对照实验）

- 反例 A：拒 bash 后文本变了——但 harness 自己也有一套拒绝反馈，不证伪就可能把 harness 原生文案当成插件成果。**证伪手段**：把插件 patch 的 `messages.bash` 原文拿去 rc.2 全源码 grep，零命中 → 该句只属于本插件。
- 反例 B：turn 停了——无法区分是 `agent/pre-step` reject 还是 harness 行为。**证伪手段**：读会话投影 `turnOutline`/`turnBoundary`——`mode='stop'` 时被拒轮结束、用户须新开轮（turn 4→5）；`mode='default'` 时被拒后同轮继续（turn 8 `openStep` step 4）。同一插件的两个 mode 形成对照。
- 教训：消费侧验证至少要有**一个变量变化时的前后对照**（改 mode 再看行为），以及**一条证伪路径**（源码 grep / profile patch 落盘），否则只能算"观察到现象"。

### 3.6 `whileServed` 门控依赖 namespace 被 Host serve

- 客户端卡片注册在 `ctx.configForms.whileServed([REJECT_POLICY_SETTINGS_NAMESPACE], ...)` 里；卡片能显示 = 该 namespace 确实被 Host serve（本次实测成立）。
- 若未来卡片消失：先查 namespace 服务状态（`configForms.describe()` 的 served 目录），再查 client bundle 加载（module table）/ 页面刷新，**别一上来怀疑 slot key**。

## 4. 计划 vs 现实（复盘 DSH-0.1.7-UPGRADE-PLAN.md）

| 计划条目 | 现实 | 偏差 |
|---|---|---|
| §2.2 逐文件改动表（J1-04/31/27/26/01） | 全部按表落地 | 无 |
| §3 peer 范围 `^0.1.7-rc.1`、值保持字符串 | 照做 | 无；但计划没提醒 cordis/schemastery 地板（§3.1） |
| §4 验证层 2：冷启动无 `disabling profile plugin row` | 未单独冷启动跑，靠运行中 profile 佐证（bundles 正常加载、插件在跑） | 建议补一次干净冷启动看 stderr |
| §4 验证层 3：`style[data-plugin]` / slot entry crashed / 表面 DOM | Configure 卡片可见（用户实证） | 无 |
| §4 验证层 4：设置写入落到 `cordis.patch.yml` | ✅ 实测落盘 + 行为变化 | **计划层 4 是最高价值的一层，别省** |
| §4"不能用 `--dump-config` 代替兼容门" | 未触发该陷阱；profile patch 是唯一真实落盘证据 | 无 |
| （计划外）判别运行中 harness 版本 | session.v4 格式 = rc.2 指纹；全局 CLI 0.1.5-rc.2 是红鲱鱼 | 计划没给判别方法 |

## 5. 给下一次升级的 checklist

1. **轨道对齐**：`pnpm view` 验证新增 API 所需的最低传递版本（尤其 cordis/schemastery 这类 schema 底座）；`^` floor 不浮到轨道，必要时删 lockfile 重装。
2. **类型排雷**：`exactOptionalPropertyTypes` / `noUnusedLocals` 等严格开关下，破坏性 API（volatile、`Promise<boolean>` 化）单独过 typecheck；标注被 TS2374/2375/2742 点名时，先拆类型面再动 schema。
3. **入口搬家写进用户视角文档**：CHANGELOG/README 里写明"设置入口从 X 移到 Y"，避免用户回来问"怎么没了"。
4. **消费侧行为对照**：至少一组**同一插件、不同配置的行为对照**（本插件 = stop vs default）+ 一条**证伪路径**（源码 grep / 落盘检查）。
5. **运行时版本判别**：看 `~/.dsh/sessions/**/session.vX.jsonl.zstd` 与 projcache version，不信全局 CLI 版本。
6. **插件运行源码判定**：profile 是 `link:` 时，运行的是仓库 `lib/`；验证 volatile 时**不要重启进程**——"不重启也生效"正是要验证的卖点。
7. **验证层 2 别省**：挑一次干净冷启动 grep stderr 的 `disabling profile plugin row`，把计划 §4 的兼容门补齐。

## 6. 相关文件索引

- 迁移：`src/index.ts`（volatile Config / `z<RuntimeConfig>`）、`src/client/`（`plugins.row.config` 卡片）、`tsdown.config.ts`（client EXTERNAL）、`package.json`（peer/`dsh.client.inject`）、`cordis.patch.yml`。
- 仓库内验证：`tests/reject-policy-check.mts`（写 volatile 符号模拟 `_commitVolatile`，18/18）。
- 真机证据：`~/.dsh/profiles/dev_web/cordis.patch.yml`（`mode: default` 落盘行 346）、当前会话 projcache（`turnOutline` turn 4/8 对照）。
- 上游：`DSH-0.1.7-UPGRADE-PLAN.md` §2.2/§3/§4；`packages/client/ui-plugin-manager/README.md`（"配置渲染在本页而不是设置里"）。