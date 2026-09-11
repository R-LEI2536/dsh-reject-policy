# dsh-reject-policy

DSH plugin that rewrites the text returned to the model when a tool call is
rejected, and optionally halts the turn after the rejection.

## Project

- Standalone DSH plugin package (version `0.2.2`, `name = dsh-reject-policy`).
- Lives at the repo root, deliberately **not** inside a `packages/` directory
  — it is deployment-side composition, not an official upstream package.
- Two halves compiled into one published surface:
  - **Host half** — Node/Cordis plugin (`src/index.ts`); rewrites denial text
    on `tools/post-execute` and returns `{ kind: 'reject' }` on `agent/pre-step`
    when `mode === 'stop'`.
  - **Client half** — browser/Cordis client plugin (`src/client/`); renders
    one settings card under the `reject-policy` namespace.
- The plugin id, the cordis patch id, and the settings namespace are all the
  same string: `reject-policy` (see `REJECT_POLICY_SETTINGS_NAMESPACE` in
  `src/shared.ts`). The package `name` keeps the `dsh-` prefix; the runtime
  ids do not.
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
  pnpm refuses to recreate `node_modules` without a TTY.
- `pnpm run typecheck` — `tsc --noEmit` against `tsconfig.json` (host tree).
- `pnpm run typecheck:client` — `tsc --noEmit -p tsconfig.client.json`
  (client tree; `noEmit: true`).
- `pnpm run ci:drift` — greps the installed `@deepseek-ai/dsh-tools` source
  for the rejection-text prefix; exits `1` if upstream drifted. **Always run
  after upgrading `@deepseek-ai/dsh-tools`.**
- `pnpm run test` — `pnpm ci:drift` then `tsx tests/reject-policy-check.mts`.
  The check file has 18 assertions across 7 numbered cases; it uses `tsx`
  directly, no test framework.
- `pnpm run build` — `pnpm ci:drift` then `tsc -p tsconfig.json` (emits
  `.d.ts` into `lib/types/`) then `tsdown` (bundles host + client).
- Install into a DSH profile (consumer-side, not part of this repo's CI):
  - `dsh plugin --profile web add "link:/home/hive/projects/dsh-plugin_dev/dsh-reject-policy"`
  - `dsh plugin --profile web add "github:<owner>/dsh-reject-policy#main"`
- No lint, no formatter, no pre-commit hooks, no GitHub Actions workflow is
  configured in this repo.

## Architecture

- `src/index.ts` — host plugin. Exports `name`, `Config`, `Config` (schema),
  `apply(ctx, config)`, `OFFICIAL_REJECTION_TEMPLATE`, `resolveMessage`,
  `isStopPending`, `clearStopPending`, plus the re-exports from `shared.ts`.
  - `tools/post-execute` listener: when `exec.agent` exists, the tool name is
    in `stopOnRejectTools`, and `result.error.message` literally matches
    `the user rejected tool "<name>"` → return `{ kind: 'block', feedback }`
    with the resolved text, and (when `mode === 'stop'`) set a
    `WeakMap<Session, true>` stop-pending flag.
  - `agent/pre-step` listener: if the flag is set, delete it and return
    `{ kind: 'reject' }` so the agent loop closes the turn with
    `kind: 'blocked'`.
  - Augments `@deepseek-ai/cordis`'s `Context` with a typed `settings`
    service (mirrors the in-monorepo declaration; external plugins do not
    transitively see it from npm).
  - Mounts a one-shot `console.warn` so users notice the literal-template
    coupling. Keep the warning when refactoring.
- `src/shared.ts` — **pure type/constant surface** shared by host and client.
  Zero runtime imports. The client bundle's purity gate forbids adding
  runtime deps here. Re-exports the settings namespace constant so the host
  and client pick the same key by construction.
- `src/client/index.ts` — registers one `settings.plugin.item` slot entry.
  All `@deepseek-ai/dsh-client-*` imports are `import type {}` for slot-map
  augmentation only — value imports would break the bundle.
- `src/client/RejectPolicyCard.tsx` — staged Save/Discard pattern over
  `SettingsScope<RejectPolicySettings>`. When the staged edit equals the
  cordis `base`, calls `scope.unset` instead of writing a redundant override.
- `src/client/locales.ts` — `en` + `zh` dictionaries for the card. Add new
  keys to both objects.
- `src/client/RejectPolicyCard.module.css` — CSS Modules; the
  `dsh-css-modules-inline` plugin in `tsdown.config.ts` hashes classes via
  lightningcss and inlines the stylesheet at factory execution.
- `cordis.patch.yml` — published patch referenced from
  `package.json#dsh.bundle.patch`. Carries default install-time config:
  `stopOnRejectTools: []`, a `bash` message override, and a `defaultMessage`
  template.
- `tests/reject-policy-check.mts` — mounts the plugin against a real
  `cordis.Context` with a fake `settings` service, then drives
  `tools/post-execute` and `agent/pre-step` waterfalls. No real approval,
  no real agent loop.
- `scripts/check-official-template.ts` — drift guard described above.
- `docs/DESIGN.md` — design rationale, the 2×2 mode/message matrix, rejected
  alternatives. Source of truth for "why" decisions; this file is the "how".
- `tsdown.config.ts` — two `defineConfig`s: `host` (ESM, node platform, takes
  `lib/types/index.js` as entry) and `client` (browser, takes
  `src/client/index.ts` directly, never `tsc -p tsconfig.client.json`,
  wraps output in a `window.__ModuleLoader__.load` factory banner).
- `tsconfig.json` excludes `src/client` and `tests`; `tsconfig.client.json`
  is `noEmit` and exists only for the typecheck gate.

## Conventions

- `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`.
  Optional fields are omitted with conditional spreads when their absence
  changes the inferred type (see `src/index.ts`'s `cfg` construction).
- Do **not** duplicate `OFFICIAL_REJECTION_TEMPLATE`; it is exported from
  `src/index.ts` and re-used by the drift check's prefix and the test
  fixture.
- The plugin `name` and settings namespace are bare `reject-policy`. The
  package `name` is `dsh-reject-policy`. Renaming one implies renaming the
  other two plus the cordis patch `id` (`cordis.patch.yml`).
- The detection text is matched **literally**, including the leading `the`
  (lowercase). Do not lowercase-normalize — the published upstream message
  is itself lowercase.
- Source comments and `docs/DESIGN.md` are mixed Chinese/English; user-facing
  `README.md` is English. Keep tone consistent when editing each surface.
- `.env` at the repo root holds local harness dev secrets; it is
  git-ignored. Do not commit secrets; do not echo them into docs.
- `pnpm-lock.yaml` is the source of truth for installed versions; the
  `@deepseek-ai/dsh-*` peer-dep range is the only knob that pins us to
  a given upstream train. **Note**: prerelease semver (`^0.1.0-rc.1`)
  does not float forward to later `0.1.x-rc.y` builds under node-semver's
  default prerelease rules — bump the range explicitly when chasing a
  new train, and delete `pnpm-lock.yaml` before reinstalling.

## Pitfalls

- **Upstream drift silently breaks detection.** If `@deepseek-ai/dsh-tools`
  rewrites the rejection message, the literal-match check returns false and
  the plugin appears to do nothing — no error, no warning. Run
  `pnpm run ci:drift` (wired into `test` and `build`) after upgrading the
  peer dep; if it fails, update `OFFICIAL_REJECTION_TEMPLATE` in
  `src/index.ts` and re-run.
- **Coverage gap.** The plugin only sees tool calls that flow through the
  agent loop. Harness-internal bash and other out-of-loop tool calls are
  invisible; do not promise otherwise.
- **`mode` defaults to `'stop'`.** The very first rejection halts the turn.
  Consumers wanting "rewrite only, never halt" must explicitly install with
  `mode: 'default'` or set it at runtime via
  `ctx.settings.update(REJECT_POLICY_SETTINGS_NAMESPACE, { mode: 'default' })`.
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
  precisely to keep the `.d.ts` emit).
- **`pnpm-workspace.yaml` enables only the `esbuild` allow-build.** Add
  new entries here when adopting a new postinstall-step dep.
- **No CI workflow, no lint, no formatter.** All gates are the four
  `pnpm` scripts above plus reviewer discipline.
- **Upstream line numbers in `OFFICIAL_REJECTION_TEMPLATE`'s comments**
  (`packages/core/tools/src/index.ts:1707` in `README.md`, `:1716` in
  `docs/DESIGN.md`) drift across DSH releases. Do not "fix" the constant
  to match the line — the constant must match the actual message text.
  Treat the line numbers as informational only; the drift check asserts
  on the stable string prefix `the user rejected tool "`, not on a line.

## Maintenance

- Whenever you discover a new repo-specific command, convention, or pitfall,
  update this file in place. Keep it accurate and concise; remove stale
  entries. Prefer bullets over prose; cite paths inline with backticks.
