# Changelog

## 0.5.2 (2026-11-05)

DSH `0.2.2-rc.1` alignment. Per the
[DSH 0.2.2-rc.1 plugin upgrade guide](../deepseek-harness/DSH-0.2.2-rc.1-插件升级指南.md)
§4.4: no `src/**` runtime change was required — every upstream surface this
plugin consumes is unchanged — but the dependency declaration, the drift guard,
and the test's volatile-write simulation needed work.

- chore(deps): the 10 `@deepseek-ai/dsh-*` packages this plugin consumes are now
  explicit `devDependencies` pinned exactly to `0.2.2-rc.1`. The repo had none:
  `typecheck`/`build` leaned on pnpm's auto-installed peers, which resolved the
  previous train. Base libraries pinned the same way:
  `@deepseek-ai/cordis` `4.1.0`, `@deepseek-ai/schemastery` `3.19.0`.
- chore(deps): peer ranges widened two-sidedly. `@deepseek-ai/dsh-*` peers
  `^0.2.1-rc.1` → `^0.2.1-rc.1 || ^0.2.2-rc.1`; `@deepseek-ai/cordis` `~4.0.5`
  → `^4.0.5`; `@deepseek-ai/schemastery` `~3.18.5` → `^3.18.5` (`~3.18.5` never
  admits 3.19.0, the 0.2.2-rc.1 minor). The OR form matters off-gate too:
  node-semver's default prerelease rules do not let `0.2.2-rc.1` satisfy
  `^0.2.1-rc.1`, so a pnpm profile install would report an unmet peer without
  it; the boot gate's `includePrerelease` check accepts either form.
- fix(ci): `scripts/check-official-template.ts` follows the 0.2.2-rc.1 package
  layout. `dsh-tools` moved the rejection literal from `src/index.ts` into the
  execution pipeline (`src/pipeline.ts:460`, published as `lib/pipeline.js` /
  the `@deepseek-ai/dsh-tools/pipeline` sub-entry) and no longer publishes
  `src/` at all, so the old `src/index.ts` + `lib/index.js` candidate pair would
  have false-failed. The guard now checks both layouts, then falls back to
  scanning every top-level `lib/*.js` chunk.
- test: the volatile-write simulation now reads the schema-resolved Config from
  `fiber.effectiveConfig`. cordis `4.1.0` keeps the raw input in `fiber.config`
  and moved the resolved object aside — the same split the Loader's
  `_commitVolatile` follows (`vendor/loader/src/config/entry.ts`). On 4.1.0
  `fiber.config.mode` is `undefined`, so the old fixture threw before any
  assertion ran. Still 18/18 across the 7 cases.
- chore(repo): `lib/` rebuilt against the `0.2.2-rc.1` type surface (host +
  client bundles and `lib/types/`).
- **compat**: the floor is unchanged (still rejected on `0.2.0-rc.*` and older).
  One artifact now serves `0.2.1-rc.*` and `0.2.2-rc.1`: the boot gate accepts
  this manifest on `0.2.1-rc.1` / `rc.2` / `rc.5` / `0.2.2-rc.1`, so rolling the
  host back does not need a plugin re-release.
- **note (host behavior, no plugin change)**: on `0.2.2-rc.1` the whole Plugins
  page is wrapped in `remoteAccess.whenAccess('pluginManager/listBundles')`
  (`ui-plugin-manager/src/client/index.ts`), so a non-owner or restricted Peer
  no longer sees the `plugins.row.config` page. Owners see it as before.

Upstream contract check against the `0.2.2-rc.1` source tree:

- `packages/core/tools/src/pipeline.ts:460` — the approval denial still writes
  `the user rejected tool "${exec.name}"`, and `pipeline.ts:213-222` copies
  `decision.reason` into `error.message` — exactly the value the plugin matches.
  The literal moved from `src/index.ts:1755` (`1763` on 0.2.1-rc.2).
- `packages/core/tools/src/contracts.ts:367-370` — `PostToolDecision` still
  carries `{ kind: 'block'; feedback }`; `events.ts:41` keeps the
  `tools/post-execute` waterfall shape `(exec, result, next)`.
- `packages/core/agent/src/runtime-types.ts:139-140` — `agent/pre-step` still
  accepts `{ kind: 'reject' }`.
- `packages/settings/settings/src/index.ts:266` —
  `ctx.settings.configure({ auto }, owner)` is unchanged.
- Client contracts: `plugins.row.config`
  (`ui-plugin-manager/src/client/slot-contract.ts:150`), `ConfigPageForm`
  (`:172-177`), `ConfigFormSnapshot`, `ConfigForms.whileServed`,
  `ctx.slots.inject/register`, `LocaleNamespaceMap`, `Menu` /
  `IconChevronDownOutlineRegular` are all unchanged.
- Guide §3 checklist: 0 hits in this plugin — no `tools` row composition (so no
  executor / `mode` / `maxParallelSubCalls` surface), no `list-agents`
  sub-entry patch, no `modelSelectionSettings`, no `assembly.tools` read, no
  renamed menu / chat / composer client symbol, and no import of a removed
  package (`dsh-invariants`, `ui-deepseek-model-label-1017`) or of the moved
  bundle lists.

Verified on `0.2.2-rc.1` devDeps (Node 24.18.0, pnpm 11.28.5): `ci:drift`
(literal found in the published `lib/pipeline.js`), host `typecheck`, client
`typecheck`, `test` (18/18), `build`. Boot-gate real computation with the local
host's `evaluatePluginCompatibility`: PASS on `0.2.2-rc.1` and on `0.2.1-rc.5`,
while the control group (peer pinned to exact `0.2.1-rc.5`) is REJECT — the check
is not vacuous. This is the in-repo (L1) layer only: the local host is still
`0.2.1-rc.5`, so a `0.2.2-rc.1` cold start (boot stderr), the Plugins-page
Configure card, a volatile save, and one real rejection are still to be
verified live.

## 0.5.1 (2026-11-02)

Packaging fix for GitHub-source installs; no `src/**` change, behavior is
identical to 0.5.0.

- fix(repo): commit the built `lib/` output (remove it from `.gitignore`).
  GitHub-source installs
  (`dsh plugin --profile <name> add "github:<owner>/dsh-reject-policy#main"`)
  get no build step, so the previously ignored `lib/index.js` was missing and
  the host failed to activate the plugin with
  `ERR_MODULE_NOT_FOUND: .../dsh-reject-policy/lib/index.js`. Rebuild
  (`pnpm run build`) before every tag from now on.

## 0.5.0 (2026-10-19)

DSH `0.2.1-rc.1`+ alignment (target train `0.2.1-rc.2`). Per the
[DSH 0.2.1-rc.2 plugin upgrade guide](../deepseek-harness/DSH-0.2.1-rc.2-插件升级指南.md):
this train's boot compatibility gate rejects every `0.2.0-rc.*` peer range, so
the peer floor moves and **no `src/**` change was required** — every upstream
surface this plugin consumes is unchanged (see below).

- chore(deps): every `@deepseek-ai/dsh-*` peer range `^0.2.0-rc.1` →
  `^0.2.1-rc.1` (10 entries). `^0.2.1-rc.1` admits `0.2.1-rc.1/rc.2` under
  node-semver's prerelease rules *and* the boot gate's `includePrerelease`
  check, so later rc builds of this train need no further bump.
- chore(deps): raise the base libraries to the 0.2.1 train's floors:
  `@deepseek-ai/cordis` `^4.0.4` → `~4.0.5`, `@deepseek-ai/schemastery`
  `^3.18.4` → `~3.18.5` (the published `dsh-*` packages peer on those exact
  minors; `~` keeps one copy in the dev tree).
- chore(deps): `pnpm-lock.yaml` regenerated from scratch; it resolves
  `@deepseek-ai/dsh-*` at `0.2.1-rc.2`, cordis `4.0.5`, schemastery
  `3.18.5`, with no `0.2.0-rc.*` entries and no
  `@deepseek-ai/dsh-invariants`.
- chore(repo): upgrade work moved onto a nested git worktree
  (`.worktrees/`, git-ignored) so the main checkout stays untouched until
  merge.
- **compat**: the raised floor is one-directional — this version is now
  rejected on an `0.2.0-rc.*` (or older) host (`disabling profile plugin row`
  / `incompatible-version` at install). Ship it in the same batch as the host
  upgrade.

Upstream contract check against the `0.2.1-rc.2` source tree (no
plugin-facing change on any consumed surface):

- `packages/core/tools/src/index.ts` — `serviceAsk` still denies with
  `the user rejected tool "<name>"` (text unchanged; line drifted
  `1755` → `1763`); the `tools/post-execute` waterfall and its
  `PostToolDecision` (`accept` / `block`) are unchanged.
- `packages/core/agent/src/runtime-types.ts` — `agent/pre-step` and
  `PreStepDecision` (still includes `{ kind: 'reject' }`) are unchanged.
- `packages/settings/settings/src/index.ts` — `ctx.settings.configure({
  auto }, owner)` is unchanged.
- Client contracts: `plugins.row.config` + `PluginConfigViewProps` /
  `ConfigPageForm { state, mutate }`, `ConfigFormSnapshot`,
  `ConfigForms.whileServed`, `ctx.slots.inject/register`,
  `LocaleNamespaceMap`, `Menu` / `IconChevronDownOutlineRegular` are all
  unchanged.
- Guide §3 checklist: no hit in this plugin (no `./invariant`, no
  `mode: both`, no removed client symbols, no web-provider / model-label
  slot usage, no removed composition keys).

Verified on `0.2.1-rc.2` devDeps: `ci:drift` (prefix found in the published
`dsh-tools` bundle), host `typecheck`, client `typecheck`, `test` (18/18),
`build`, and client bundle purity (externals are only `react`,
`react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives` — no
schemastery/cordis leak). This is the in-repo (L1) layer only; a real
`0.2.1-rc.2` host cold-start (boot-gate stderr), the Plugins-page Configure
card, volatile save, and a real rejection are still to be verified live.

## 0.4.0 (2026-10-02)

DSH `0.2.0-rc.1`+ alignment (target train `0.2.0-rc.2`). Per the
[DSH 0.2.0 upgrade plan](../deepseek-harness/DSH-0.2.0-UPGRADE-PLAN.md) §2.2:
this train's boot compatibility gate rejects every `0.1.7-*` peer range, so
the peer floor moves and nothing else. **No `src/**` change was required** —
the two upstream surfaces this plugin consumes are byte-identical between
`0.1.7-rc.2` and `0.2.0-rc.2` (see below).

- chore(deps): every `@deepseek-ai/dsh-*` peer range `^0.1.7-rc.1` →
  `^0.2.0-rc.1` (10 entries). `^0.2.0-rc.1` admits `0.2.0-rc.1/rc.2/0.3/0.4…`
  and rejects `0.3.0`, so later rc builds of this train need no further bump.
  `@deepseek-ai/cordis` (`^4.0.4`) and `@deepseek-ai/schemastery` (`^3.18.4`)
  are untouched — the gate skips non-`dsh-*` names and both libraries are
  unchanged across the corridor.
- chore(deps): `pnpm-lock.yaml` regenerated from scratch; all 10
  `@deepseek-ai/dsh-*` resolutions moved `0.1.7-rc.2` → `0.2.0-rc.2`.
- **compat**: the raised floor is one-directional — this version is now
  rejected on an `0.1.7-rc.*` host (`disabling profile plugin row` /
  `incompatible-version` at install). Ship it in the same batch as the host
  upgrade.

Upstream contract check for this plugin (both trees verified byte-identical):

- `packages/core/tools/src/**` — `OFFICIAL_REJECTION_TEMPLATE` still
  `the user rejected tool "<name>"` at the same line (`index.ts:1755`); the
  `tools/post-execute` and `agent/pre-step` waterfalls are unchanged.
- `packages/client/ui-plugin-manager/src/client/{slot-contract,config-ledger}.ts`
  — the `plugins.row.config` slot, `PluginConfigViewProps` and
  `ConfigPageForm` are unchanged; the corridor's two reverted
  `rowSwitches`/`bundle-switch` features never existed in `0.1.7-rc.2`.
- `packages/client/ui-settings/src/**` — zero diff, so `ctx.configForms` and
  the `whileServed` gating are unchanged.

Verified on `0.2.0-rc.2` devDeps: `ci:drift` (prefix found in the published
`dsh-tools` bundle), host `typecheck`, client `typecheck`, `test` (18/18),
and `build` all pass; client bundle purity holds (externals are only
`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives` — no
schemastery/cordis leak). This is the in-repo (L1) layer only; a real
`0.2.0-rc.2` host cold-start (boot-gate stderr), Plugins-page Configure card,
volatile save, and the plan's `[unverified]` `config-editor` inheritance
change still need live verification.

## 0.3.0 (2026-09-XX)

DSH `0.1.7-rc.1`+ alignment (target train `0.1.7-rc.2`). Per the
[DSH 0.1.7 upgrade plan](../deepseek-harness/DSH-0.1.7-UPGRADE-PLAN.md):
the settings transport was replaced by volatile Config fields, the client
card moved from the retired Settings Plugins section onto the Plugins page,
and the peer floor was raised to the rc.2 train.

- **breaking(host)**: drop `settings.installSection` / the settings-section
  transport. `mode` and `stopOnRejectTools` are now **volatile Config fields**
  (schema `.volatile()`); runtime edits write `<profile>/cordis.patch.yml`
  and land in the running plugin without a remount. `apply` now receives the
  resolved `RuntimeConfig` shape (`Volatile<T>` wrappers); the public
  `Config` type keeps the patch-facing shape from 0.2.2.
- **breaking(client)**: `ctx.settingsScope` → `ctx.configForms`
  (`set/unset/mutate` return `Promise<boolean>`); the card leaves the retired
  `settings.plugin.item` seat and registers into the Plugins page's
  `plugins.row.config` slot (key `dsh-reject-policy#reject-policy`), giving
  the bundle's row a **Configure** page.
- feat: `ctx.settings.configure({ auto: false })` registered for the plugin,
  mirroring the official custom-page plugins (ui-theme / ui-chat).
- chore(deps): every `@deepseek-ai/dsh-*` peer range `^0.1.5-rc.1` →
  `^0.1.7-rc.1`; drop the retired `@deepseek-ai/dsh-client-ui-settings-plugins`
  peer; add `@deepseek-ai/dsh-client-ui-plugin-manager`; raise
  `@deepseek-ai/cordis` to `^4.0.4` and `@deepseek-ai/schemastery` to
  `^3.18.4` (the rc.2 train's transitive peers require them — earlier
  versions lack the `.volatile()` API).
- style(client): `IconChevronDownOutline14` → `IconChevronDownOutlineRegular`
  (J1-26 icon rename); the disclosure card chrome is removed — the Plugins
  page owns title/crumb/description now.
- test: `tests/reject-policy-check.mts` drives runtime mode switches by
  writing the volatile references directly (`Symbol.for('cosmokit.volatile.write')`),
  the same in-place update the Loader's `_commitVolatile` performs; still
  18/18 across the 7 cases.

Verified on `0.1.7-rc.2`: `ci:drift` (upstream message unchanged at
`packages/core/tools/src/index.ts:1755`), host `typecheck`, client
`typecheck`, `test` (18/18), `build` all pass; client bundle purity holds
(no `@deepseek-ai/schemastery` leak). Consumer-side live verification on
the `dev_web` profile also passed: rejection rewrite, Plugins-page
Configure card, volatile save into `cordis.patch.yml` (`mode: default`),
and an immediate `stop`→`default` behavior change with no remount — see
[docs/UPGRADE-0.1.7-LESSONS.md](./docs/UPGRADE-0.1.7-LESSONS.md).

## 0.2.2 (2026-09-11)

DSH `0.1.5-rc.1` alignment. Per the
[DSH 0.1.5 upgrade audit](../deepseek-harness/DSH-0.1.5-UPGRADE-AUDIT.md),
`@deepseek-ai/dsh-client-runtime` was removed in 0.1.5 (split into
`dsh-client-ui-settings` / `ui-renderer` / `ui-slots`), and prerelease
semver does not float `^0.1.0-rc.1` forward to later `0.1.x-rc.y` —
so the lockfile had been stuck at `0.1.0-rc.8` against an audit
target of `0.1.5-rc.1`.

- fix(client): `SettingsScope` now imported from
  `@deepseek-ai/dsh-client-ui-settings/client` (was
  `@deepseek-ai/dsh-client-runtime/client`, no longer published in
  0.1.5).
- chore(deps): bump every `@deepseek-ai/dsh-*` peer range from
  `^0.1.0-rc.1` to `^0.1.5-rc.1`; drop the dead
  `@deepseek-ai/dsh-client-runtime` peer.
- docs(AGENTS): correct the "peer range is the only anchor" bullet
  with the prerelease-semver rule; document the pnpm 11
  read-only-system-store install quirk (`--store-dir=.pnpm-store` +
  `CI=true`).

Verified on `0.1.5-rc.1`: `ci:drift`, host `typecheck`, client
`typecheck`, `test` (18/18), `build` all pass; client bundle purity
holds (no `@deepseek-ai/schemastery` leak).

## 0.2.1 (2026-09-06)

Patch release. Cleanup since `v0.2.0`.

- fix: move `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` to `peerDependencies` so the host's copies are not shadowed.
- feat: one-time startup warning surfaces the upstream-drift detection coupling.
- refactor: test fixture imports `OFFICIAL_REJECTION_TEMPLATE` from the plugin instead of duplicating the literal.
- chore: wire `ci:drift` into `pnpm run test` and `pnpm run build`; drop the standalone GitHub Actions workflow.
- docs: add `AGENTS.md` for future agent sessions.

## 0.1.0 (2026-09-05)

Initial standalone release. Migrated from `deepseek-harness/plugin-reject-policy/`.

Features (unchanged from monorepo version):

- Custom denial messages via `messages[name]` or `defaultMessage` template.
- Optional turn stop after rejection (`mode: 'stop'`).
- Per-tool scoping via `stopOnRejectTools`.
- Runtime `mode` toggle via `ctx.settings`.
