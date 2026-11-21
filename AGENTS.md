# dsh-reject-policy

DSH plugin that rewrites the text returned to the model when a tool call is
rejected, and optionally halts the turn after the rejection.

## Project

- Standalone DSH plugin package (version `0.5.3`, `name = dsh-reject-policy`).
- Targets DSH `0.2.2-rc.3`+ (`^0.2.2-rc.3` peer ranges; the 10 consumed
  `@deepseek-ai/dsh-*` packages are also pinned as exact `devDependencies`
  to the latest verified rc (`0.2.2-rc.3`) for typecheck/build). The peer
  floor is the **detection floor**: approval denials carry `error.info` only
  from `0.2.2-rc.3`, and info-only detection means anything older can never
  trigger — so the boot compatibility gate now rejects installs on
  `0.2.2-rc.1`–`rc.2`, `0.2.1-rc.*` and `0.2.0-rc.*` (or older) hosts
  alike.
- Building and verifying against the `0.2.2-rc.3` devDeps requires Node
  `>= 24.9.0` (that train dropped Node 22). The published plugin has no Node
  floor of its own; it runs on whatever Node the host runs.
- Lives at the repo root, deliberately **not** inside a `packages/` directory
  — it is deployment-side composition, not an official upstream package.
- Two halves compiled into one published surface:
  - **Host half** — Node/Cordis plugin (`src/index.ts`); rewrites denial text
    on `tools/post-execute` and returns `{ kind: 'reject' }` on `agent/pre-step`
    when `mode === 'stop'`. `mode` / `stopOnRejectTools` are volatile Config
    fields; `messages` / `defaultMessage` stay patch-only.
  - **Client half** — browser/Cordis client plugin (`src/client/`); renders
    the reject-policy configuration page on the Plugins page via the
    `plugins.row.config` slot (key `dsh-reject-policy#reject-policy`).
- The plugin id, the cordis patch id, and the settings namespace are all the
  same string: `reject-policy` (see `REJECT_POLICY_SETTINGS_NAMESPACE` in
  `src/shared.ts`). The `plugins.row.config` key joins the package name with
  that id (`REJECT_POLICY_ROW_CONFIG_KEY`). The package `name` keeps the
  `dsh-` prefix; the runtime ids do not.
- Published entrypoints (`package.json#exports`):
  - `.` → host runtime
  - `./client` → client runtime
  - `./src/*` → raw sources
- Bundler: `tsdown` (see `tsdown.config.ts`). Produces `lib/index.js` (host,
  ESM) and `lib/client.js` (browser, CJS-wrapped lazy factory).

## Commands

Run from the repo root with `pnpm`.

- `pnpm install` — installs deps; pnpm content-addressable store is pinned to
  `.pnpm-store/` via `.npmrc`. `pnpm-workspace.yaml` only enables the
  `esbuild` allow-build. **pnpm 11 quirk**: in this environment the
  `.npmrc` `store-dir=.pnpm-store` is not always honored on a fresh install
  (the system store at `~/.local/share/pnpm/store/v11/` is read-only and
  pnpm errors with `ERR_PNPM_EROFS` mid-resolve). Pass `--store-dir=.pnpm-store`
  on the CLI as a belt-and-braces measure; `CI=true` is also required because
  pnpm refuses to recreate `node_modules` without a TTY. When bumping the dsh
  train, add `--no-frozen-lockfile --config.minimumReleaseAge=0` (`CI=true`
  implies a frozen lockfile, and pnpm 11's default 1440-minute release-age
  window would otherwise resolve back to the previous rc).
- `pnpm run typecheck` — `tsc --noEmit` against `tsconfig.json` (host tree).
- `pnpm run typecheck:client` — `tsc --noEmit -p tsconfig.client.json`
  (client tree; `noEmit: true`).
- `pnpm run ci:drift` — scans the installed `@deepseek-ai/dsh-tools` for the
  two structured identity strings the plugin duplicates:
  `ApprovalError` (name) and `APPROVAL_REJECTED` (code). Candidates in
  order: `src/error-codes.ts` (0.2.2-rc.3+ unpacked tree, and every published
  tarball from 0.2.2-rc.3 — its `package.json#files` now ships `src`),
  `src/pipeline.ts` (0.2.2-rc.1+ unpacked tree), `src/index.ts` (older
  unpacked tree), `lib/pipeline.js` (0.2.2-rc.1+ published `./pipeline`
  sub-entry), `lib/index.js` (older published bundle); then a fallback scan
  over every top-level `lib/*.js` chunk. Exits `1` if either has drifted.
  **Always run after upgrading `@deepseek-ai/dsh-tools`.**
- `pnpm run test` — `pnpm ci:drift` then `tsx tests/reject-policy-check.mts`.
  The check file has 27 assertions across 8 numbered cases; it uses `tsx`
  directly, no test framework.
- `pnpm run build` — `pnpm ci:drift` then `tsc -p tsconfig.json` (emits
  `.d.ts` into `lib/types/`) then `tsdown` (bundles host + client).
- `lib/` is **committed** (not git-ignored). GitHub-source installs
  (`github:<owner>/dsh-reject-policy#main`) get no build step, so the built
  host/client bundles must be in git — that is what makes
  `dsh plugin add "github:..."` work at all. Run `pnpm run build` and commit
  `lib/` before every tag; a tag without a fresh `lib/` reproduces the
  `ERR_MODULE_NOT_FOUND` activation failure.
- Install into a DSH profile (consumer-side, not part of this repo's CI):
  - `dsh plugin --profile web add "link:/home/hive/projects/dsh-plugin_dev/dsh-reject-policy"`
  - `dsh plugin --profile web add "github:<owner>/dsh-reject-policy#main"`
- Upgrade work runs on a branch in a nested git worktree
  (`.worktrees/<name>`, git-ignored) because the session file sandbox is
  rooted at this repo; the main checkout stays untouched until merge.
  Create with `git worktree add .worktrees/<name> -b <branch> HEAD` and
  install inside it with an absolute `--store-dir` pointing at the main
  checkout's `.pnpm-store`.
- Build the final `lib/` from the **main checkout**, never from a nested
  worktree: `lib/client.js` embeds the absolute CSS source path and the
  lightningcss CSS-module hash derives from it, so a worktree build has a
  different class hash (and different bundle bytes) than a main-checkout build.
  Merge first, then `pnpm install && pnpm run build` in the main checkout and
  commit `lib/` separately.
- No lint, no formatter, no pre-commit hooks, no GitHub Actions workflow is
  configured in this repo.

## Architecture

- `src/index.ts` — host plugin. Exports `name`, `Config` (interface, the
  patch-facing input shape, all-optional), `Config` (const, the schemastery
  schema), `RuntimeConfig` (resolved apply-facing shape), `apply(ctx, config)`,
  `resolveMessage`, `isStopPending`, `clearStopPending`, plus the re-exports
  from `shared.ts`. `isRejectionResult` is private, info-only.
  - `tools/post-execute` listener: when `exec.agent` exists, the tool name is
    in `stopOnRejectTools`, and the result carries the structured approval
    identity (`error.info.name === 'ApprovalError'` + `error.info.code ===
    'APPROVAL_REJECTED'`, 0.2.2-rc.3+ — the only detection signal; there is no
    message-text fallback) → return `{ kind: 'block', feedback, info }` with
    the resolved text and the upstream `info` passed through, and (when
    `mode === 'stop'`) set a `WeakMap<Session, true>` stop-pending flag.
  - `agent/pre-step` listener: if the flag is set, delete it and return
    `{ kind: 'reject' }` so the agent loop closes the turn with
    `kind: 'blocked'`.
  - The schema marks `mode` / `stopOnRejectTools` with `.volatile()`: runtime
    edits land in `<profile>/cordis.patch.yml` and the Loader updates the
    volatile references in place (`loader/volatile-update`, no remount). Both
    listeners read `config.mode.get()` / `config.stopOnRejectTools.get()` at
    event time, so no `loader/volatile-update` subscription is needed.
  - `apply` registers `ctx.settings.configure({ auto: false }, ctx.fiber)`
    via a conditional `ctx.inject(['settings'], ...)` block (needs
    `import type {} from '@deepseek-ai/dsh-settings'` for typing; a host
    without the settings service simply never runs the block).
  - Mounts a one-shot `console.warn` so users notice the identity-contract
    coupling (info-only detection, old hosts unsupported). Keep the warning
    when refactoring.
- `src/shared.ts` — **pure type/constant surface** shared by host and client.
  Zero runtime imports. The client bundle's purity gate forbids adding
  runtime deps here. Re-exports the settings namespace constant plus the
  package name and the `plugins.row.config` key, so host and client pick the
  same ids by construction.
- `src/client/index.ts` — registers the row configuration page while the Host
  serves the `reject-policy` namespace: `ctx.configForms.whileServed([...],
  () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({...},
  RejectPolicyCard)))`. All `@deepseek-ai/dsh-client-*` imports are
  `import type {}` for service/slot-map augmentation only — value imports
  would break the bundle.
- `src/client/RejectPolicyCard.tsx` — renders inside the Plugins page's row
  detail view. Props: `PropsRuntime<'plugins.row.config'> & PropsLocale<...>`;
  `view === 'summary'` yields the one-liner, `view === 'page'` renders the
  staged Save/Discard form over the page-supplied `ConfigPageForm`
  (`form.state` snapshot + `form.mutate`; `set`/`unset` become
  `{ op: 'set'|'unset', path: ['mode'] }` ops and return `Promise<boolean>`).
  When the staged edit equals the cordis `base`, sends `op: 'unset'` instead
  of writing a redundant override. No self-subscription: the page re-renders
  on describe-mirror updates.
- `src/client/locales.ts` — `en` + `zh` dictionaries for the card. Add new
  keys to both objects.
- `src/client/RejectPolicyCard.module.css` — CSS Modules; the
  `dsh-css-modules-inline` plugin in `tsdown.config.ts` hashes classes via
  lightningcss and inlines the stylesheet at factory execution.
- `cordis.patch.yml` — published patch referenced from
  `package.json#dsh.bundle.patch`. Carries default install-time config:
  `stopOnRejectTools: []`, a `bash` message override, and a `defaultMessage`
  template. `mode` is intentionally absent — the volatile default `'stop'`
  applies.
- `tests/reject-policy-check.mts` — mounts the plugin against a real
  `cordis.Context`, then drives `tools/post-execute` and `agent/pre-step`
  waterfalls. Runtime mode switches write the volatile references directly
  (`Symbol.for('cosmokit.volatile.write')`), the same in-place update the
  Loader's `_commitVolatile` performs; the references are read from
  `fiber.effectiveConfig` because cordis 4.1.0 moved the schema-resolved Config
  there (`fiber.config` is raw input now). No real approval, no real agent
  loop.
- `scripts/check-official-template.ts` — drift guard described above.
- `docs/DESIGN.md` — design rationale, the 2×2 mode/message matrix, rejected
  alternatives. Source of truth for "why" decisions; this file is the "how".
- `tsdown.config.ts` — two `defineConfig`s: `host` (ESM, node platform, takes
  `lib/types/index.js` as entry) and `client` (browser, takes
  `src/client/index.ts` directly, never `tsc -p tsconfig.client.json`,
  wraps output in a `window.__ModuleLoader__.load` factory banner). The
  client half's `dsh-css-modules-inline` plugin sorts the lightningcss class
  map by local name so the emitted bundle is byte-reproducible.
- `tsconfig.json` excludes `src/client` and `tests`; `tsconfig.client.json`
  is `noEmit` and exists only for the typecheck gate.

## Conventions

- `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`.
  Optional fields are omitted with conditional spreads when their absence
  changes the inferred type (see `src/index.ts`'s `cfg` construction).
- The runtime-editable surface is the **volatile split**: `mode` and
  `stopOnRejectTools` are `.volatile()` Config fields; `messages` and
  `defaultMessage` stay ordinary patch config (one-shot delivery, not live
  rules — a deliberate DESIGN decision, do not flip without revisiting).
- The public `Config` type is the patch-facing input shape; the schema const
  is annotated `z<RuntimeConfig>` — the two-sided input/output types of a
  volatile schema cannot bind to one `z<Config>` under
  `exactOptionalPropertyTypes`. Do not "simplify" this back to a single
  annotation; it will either fail typecheck or require a double cast.
- Do **not** duplicate the identity strings casually: `ApprovalError` /
  `APPROVAL_REJECTED` live as private consts in `src/index.ts`, mirrored by
  `scripts/check-official-template.ts`'s needles. They move together — a
  change on either side without the other makes the guard dishonest.
- The plugin `name` and settings namespace are bare `reject-policy`. The
  package `name` is `dsh-reject-policy` (`REJECT_POLICY_PACKAGE_NAME`).
  Renaming one implies renaming the other two plus the cordis patch `id`
  (`cordis.patch.yml`) and `REJECT_POLICY_ROW_CONFIG_KEY`.
- Rejection detection is **info-only**: the persisted `error.info`
  (`ApprovalError` + `APPROVAL_REJECTED`, 0.2.2-rc.3+) is the sole signal.
  Hosts whose approval denial carries no `info` (`0.2.1-rc.*` /
  `0.2.2-rc.1`–`rc.2`) are deliberately unsupported — no message-text
  fallback exists. `APPROVAL_CANCELLED` / `APPROVAL_UNAVAILABLE` are never
  treated as a user rejection. The human-readable denial message is not a
  contract; do not reintroduce a literal-text match.
- Source comments and `docs/DESIGN.md` are mixed Chinese/English; user-facing
  `README.md` is English. Keep tone consistent when editing each surface.
- `.env` at the repo root holds local harness dev secrets; it is
  git-ignored. Do not commit secrets; do not echo them into docs.
- `pnpm-lock.yaml` is the source of truth for installed versions. Two knobs
  pin the upstream train and they move together: the `@deepseek-ai/dsh-*` peer
  ranges (what consumers/hosts must satisfy — the floor must never drop below
  the detection floor) and the exact `devDependencies` pins (what this repo
  typechecks/builds against). **Note**:
  prerelease semver does not float forward across patch lines under
  node-semver's default prerelease rules (`^0.2.0-rc.1` never resolves
  `0.2.1-rc.*`) — bump both explicitly when chasing a new train, and delete
  `pnpm-lock.yaml` before reinstalling. The `0.2.2-rc.1` train raises the base
  libraries to `@deepseek-ai/cordis` `4.1.0` and `@deepseek-ai/schemastery`
  `3.19.0`; the peers must cover both the old and the new minor (`^4.0.5`,
  `^3.18.5`), because `~4.0.5` / `~3.18.5` stop below them.
- Write dsh peer ranges as an OR **only while one artifact must serve several
  trains** — `^0.2.1-rc.1 || ^0.2.2-rc.1` was such a case, kept the gate and
  pnpm happy at once (the boot gate tests each peer with
  `semver.satisfies(..., { includePrerelease: true })`, under which
  `^0.2.1-rc.1` already admitted `0.2.2-rc.1`; node-semver's **default** rules
  — pnpm peer resolution, `npm ls` — did not). Since info-only detection the
  range is a single `^0.2.2-rc.3`: do not widen it below the detection floor,
  never write `^0.2.2` alone (it rejects `0.2.2-rc.*` prerelease hosts), and
  never pin an exact rc in peers — the next rc would be rejected again.

## The boot compatibility gate

`@deepseek-ai/dsh-app-boot`'s `evaluatePluginCompatibility` prefers a plugin's
own `engines.dsh` when present — peers are then ignored entirely — and
otherwise walks only `peerDependencies` whose name is `@deepseek-ai/dsh` or
starts with `@deepseek-ai/dsh-`, testing `semver.satisfies(runtimeVersion,
range, { includePrerelease: true })`. This repo deliberately stays
peer-based: no `engines.dsh`, one source of truth, and `workspace:` ranges are
rejected inside `engines.dsh`. Consequences that bite this repo:

- `peerDependenciesMeta.optional` is **not** read — marking a dsh peer
  optional buys no exemption.
- A normal plugin row that fails the gate is flipped to `disabled` and the
  boot stderr prints `dsh: disabling profile plugin row "<row id>"`.
- A bundle package (`package.json#dsh.bundle`) that fails is skipped
  **whole** (`dsh: skipping profile bundle "<package>"`), so none of its
  rows load.
- Installation fails earlier with `incompatible-version`; the printed
  `dsh plugin allow-version ... --accept-risk` exemption is keyed to the
  exact plugin version × exact runtime version and does not survive an
  upgrade on either side.
- `--dump-config` is **not** a substitute for reading boot stderr — a
  rejected row still appears in the dump.

## Pitfalls

- **Upstream drift in either identity string disables detection silently.**
  Detection keys solely off the persisted `error.info` (`ApprovalError` /
  `APPROVAL_REJECTED`); if upstream renames either string, the plugin stops
  triggering on every host with no error and no warning. Run
  `pnpm run ci:drift` (wired into `test` and `build`) after upgrading
  `@deepseek-ai/dsh-tools`; if it fails, sync the consts in `src/index.ts`
  (name and code together) and re-run. The values live in upstream
  `src/error-codes.ts` (shipped in tarballs from 0.2.2-rc.3; before that only
  in the bundled `lib/*.js` chunks) — that is why the guard checks several
  locations plus a `lib/*.js` fallback. A guard failure is not proof of drift;
  read its candidate list first. The denial message text is not a contract;
  upstream rewording it changes nothing here.
- **A `block` decision's `info` must be passed through.** The registry rebuilds
  a blocked result as `{ message, ...decision.info }` (`pipeline.ts:501-505`),
  so blocking a rejection without re-attaching `info` would erase the upstream
  approval identity. Keep the conditional spread in `src/index.ts`; only
  `APPROVAL_REJECTED` may be re-attached, never invented for cancel/unavailable.
- **Coverage gap.** The plugin only sees tool calls that flow through the
  agent loop. Harness-internal bash and other out-of-loop tool calls are
  invisible; do not promise otherwise.
- **`mode` defaults to `'stop'`.** The very first rejection halts the turn.
  Consumers wanting "rewrite only, never halt" must explicitly install with
  `mode: 'default'` or set it at runtime via
  `ctx.settings.update(REJECT_POLICY_SETTINGS_NAMESPACE, { mode: 'default' })` —
  which writes the profile patch and needs the target field to be volatile
  (schema edits that make `mode` ordinary silently break this path).
- **`settings.plugin.item` is retired on 0.1.7-rc.\*.** The card registers
  into the Plugins page's `plugins.row.config` slot keyed
  `<package name>#<row id>` (`REJECT_POLICY_ROW_CONFIG_KEY`). The row id must
  match the `id:` in `cordis.patch.yml`; the package name must match
  `package.json#name` — both are constants in `src/shared.ts`.
- **`configForms` replaces `settingsScope`.** `ctx.configForms.get(ns)`
  returns a `ConfigForm<T>` whose `set` / `unset` / `mutate` return
  `Promise<boolean>` (no snapshot read-back needed). `whileServed` gates
  registration on the Host serving the namespace. The card deliberately takes
  the page-supplied `ConfigPageForm` (`form.state` + `form.mutate`) instead
  of binding its own form service.
- **The Plugins page itself is gated on 0.2.2-rc.1+.** `ui-plugin-manager`
  wraps the whole page in `remoteAccess.whenAccess('pluginManager/listBundles')`,
  and that endpoint is `owner-only`
  (`packages/experimental/liveshare/src/endpoint-classification.ts:144` on
  `0.2.2-rc.1`, `:147` on `0.2.2-rc.3`), so a
  non-owner Peer — restricted or not — never mounts `plugins.row.config`; the
  card's absence there is expected host behavior, not a registration bug.
  Verify the card on an owner session.
- **cordis 4.1.0 splits raw vs resolved config.** `fiber.config` is the raw
  patch input now; the schema-resolved Config (with the volatile references)
  lives on `fiber.effectiveConfig`, which is what the Loader's `_commitVolatile`
  reads. On 4.1.0 `fiber.config.mode` is `undefined` unless the fixture patch
  sets `mode`, so the old fixture's write threw on that undefined reference;
  read `fiber.effectiveConfig` instead.
- **Client bundle purity gate.** Never `import` (value) anything from
  `../index` inside `src/client/`. Value imports drag
  `@deepseek-ai/schemastery` into the browser bundle, which the loader's
  module table does not answer — the plugin then fails to load with
  "missed the module table". Cross from the client to the host tree only
  via `src/shared.ts`, and only via `import type` for slot-map augmentation.
- **CSS Modules go through `tsdown`, not `tsc`.** The
  `tsconfig.client.json` `outDir` would mirror `src/` paths under
  `lib/types/client/...`, a layout rolldown cannot read. `tsdown.config.ts`
  bundles `src/client/index.ts` directly; `tsconfig.client.json` stays
  `noEmit`.
- **`tsc -p tsconfig.json` emits into `lib/types/`.** `tsdown` then bundles
  from `lib/types/index.js`. Do not delete `lib/types/` between the two
  steps; do not add a `clean` step to `tsdown` (it is `clean: false`
  precisely to keep the `.d.ts` emit). The `Config` const must keep a
  `z<RuntimeConfig>`-style annotation or the `.d.ts` emit fails with
  TS2742 (portability through the `.pnpm` path).
- **The client bundle is only reproducible because the class map is sorted.**
  lightningcss returns CSS-module exports in an unstable order; before
  `tsdown.config.ts` sorted them, every rebuild produced a different
  `lib/client.js` (hash values stable, key order not). Keep the sort —
  without it, a no-op rebuild shows up as a spurious `lib/client.js` diff.
- **`lib/` must be rebuilt and committed before every tag.** GitHub-source
  installs consume whatever is committed in git — no `prepare`/build step
  runs. A tag whose commit lacks `lib/index.js` installs "successfully" but
  the host then fails to activate the plugin with `ERR_MODULE_NOT_FOUND:
  .../dsh-reject-policy/lib/index.js` (and `dsh: warning: 1 entry did not
  activate`). Run `pnpm run build`, commit `lib/`, then tag.
- **`pnpm-workspace.yaml` enables only the `esbuild` allow-build.** Add
  new entries here when adopting a new postinstall-step dep.
- **No CI workflow, no lint, no formatter.** All gates are the five
  `pnpm` scripts above (`typecheck`, `typecheck:client`, `ci:drift`, `test`,
  `build`) plus reviewer discipline.
- **Upstream line numbers cited in comments/docs drift across DSH releases**
  (`packages/core/tools/src/pipeline.ts:468` on `0.2.2-rc.3`, `error-codes.ts:9-12`,
  in `README.md` and `docs/DESIGN.md`), and the files themselves can move.
  Do not "fix" a cited line to match a renumbered release — the detection
  contract is the two identity strings, not any line. Treat locations as
  informational only; the drift check asserts on the strings `ApprovalError`
  and `APPROVAL_REJECTED`.

## Maintenance

- Whenever you discover a new repo-specific command, convention, or pitfall,
  update this file in place. Keep it accurate and concise; remove stale
  entries. Prefer bullets over prose; cite paths inline with backticks.
