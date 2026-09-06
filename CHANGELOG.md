# Changelog

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
