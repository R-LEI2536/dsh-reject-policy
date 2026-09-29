# Changelog

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
(no `@deepseek-ai/schemastery` leak).

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
