# Changelog

## 0.1.0 (2026-09-05)

Initial standalone release. Migrated from `deepseek-harness/plugin-reject-policy/`.

Features (unchanged from monorepo version):

- Custom denial messages via `messages[name]` or `defaultMessage` template.
- Optional turn stop after rejection (`mode: 'stop'`).
- Per-tool scoping via `stopOnRejectTools`.
- Runtime `mode` toggle via `ctx.settings`.
