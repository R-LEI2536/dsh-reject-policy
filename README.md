# `dsh-reject-policy`

DSH plugin that rewrites denial messages and optionally stops the turn when a tool call is rejected by the user.

## What & Why

When the official `serviceAsk` rejects a tool call, the model receives a fixed denial message and the turn continues. This plugin layers two extensions on top of that:

1. **Rewrite the message** — replace the default `the user rejected tool "<name>"` text with a configured per-tool override or a `{tool}` / `{name}` template.
2. **Stop the turn** (optional) — after a rejection, the next `agent/pre-step` returns `{ kind: 'reject' }`. The turn closes with `kind: 'blocked'`; the LLM is not called again.

The plugin does not modify DSH source code. Both behaviors attach to existing waterfalls (`tools/post-execute`, `agent/pre-step`).

A rejection is recognized by the structured identity `error.info = { name: 'ApprovalError', code: 'APPROVAL_REJECTED' }` on DSH `0.2.2-rc.3`+, falling back to the literal denial text `the user rejected tool "<name>"` on hosts whose approval denial carries no `error.info`.

## Behavior modes

`mode` is a **volatile Config field** (see [Configuration](#configuration)); the settings namespace (entry id) is `REJECT_POLICY_SETTINGS_NAMESPACE` (`reject-policy`).

| `mode` | message configured | message overridden | turn stopped |
|---|---|---|---|
| `'default'` | no | no | no — equivalent to stock DSH |
| `'default'` | yes | yes | no — model continues |
| `'stop'` | no | no (original text kept) | yes |
| `'stop'` | yes | yes | yes |

`mode` defaults to `'stop'`. Set it to `'default'` at install time if you want stock DSH plus message rewriting only.

## Installation

Requires DSH `0.2.1-rc.1`+ — built, typechecked and tested against `0.2.2-rc.3`. The `@deepseek-ai/dsh-*` peer ranges are `^0.2.1-rc.1 || ^0.2.2-rc.1`, so the same artifact is accepted by an `0.2.1-rc.*` host and by `0.2.2-rc.1` … `rc.3`. The host's boot compatibility gate rejects it on an `0.2.0-rc.*` (or older) host, so install it in the same batch as the host upgrade.

```sh
dsh plugin --profile web add "link:/path/to/dsh-reject-policy"
```

The plugin carries its own `cordis.patch.yml` (referenced from `package.json#dsh.bundle.patch`); no extra patch wiring is required.

To install from a GitHub checkout:

```sh
dsh plugin --profile web add "github:<owner>/dsh-reject-policy#main"
```

The repository ships the built `lib/` directory (it is committed, not
git-ignored) because GitHub-source installs do not run a build step.

## Configuration

The plugin's `Config` is the schemastery schema for the patch entry. The consumer's `cordis.patch.yml` carries:

```yaml
- insert:
    - id: reject-policy
      name: 'dsh-reject-policy'
      config:
        mode: 'stop'                    # optional; 'stop' (default) | 'default'
        stopOnRejectTools: []           # empty = every rejected tool triggers this plugin
        messages:                       # per-tool override; falls back to defaultMessage
          bash: 'The user rejected your bash call. ...'
        defaultMessage: 'The user rejected your {tool} call. Explain your motivation, then ask the user.'
```

| key | type | default | meaning |
|---|---|---|---|
| `mode` | `'default' \| 'stop'` | `'stop'` | volatile: `'stop'` rewrites + halts the turn; `'default'` rewrites only when a message is configured. |
| `stopOnRejectTools` | `string[]` | `[]` | volatile: tool names whose rejection triggers the plugin. Empty = all. |
| `messages` | `Record<string, string>` | `{}` | Per-tool override for the denial text. |
| `defaultMessage` | `string` | `undefined` | Template applied when `messages[toolName]` is missing. Supports `{tool}` and `{name}` placeholders. |

Resolution order: `messages[toolName]` → `defaultMessage` (template expansion) → official original text.

## Runtime editing

`mode` and `stopOnRejectTools` are **volatile Config fields**: they can be edited at runtime without
restarting DSH. The edit is written to the profile patch (`<profile>/cordis.patch.yml`) and the running
plugin picks the new value up on the next rejection (the Loader updates the volatile references in place).

Two ways to edit:

1. **Plugins page** — open Plugins > `dsh-reject-policy` > **Configure** on the `reject-policy` row (this
   registers the row's configuration page through the `plugins.row.config` slot). The page exposes the
   `mode` dropdown with Save / Discard.
2. **Host API** — mirror of the settings service:

   ```ts
   ctx.settings.update(REJECT_POLICY_SETTINGS_NAMESPACE, { mode: 'default' })
   ```

Both paths validate through the plugin's Config schema; an invalid write is refused and the patch is not modified.

## Model Experience

The plugin does not change system prompts, tool schemas, or model-visible configuration. It only:

- rewrites the `error.message` field of one rejected tool result;
- sets a per-session "stop pending" flag that closes the turn at the next `agent/pre-step`.

The model sees only the rewritten text and the absence of a next turn.

**What the model sees** (rewrite case):

```
The user rejected your bash call. Before using bash again, consider whether a dedicated tool
could replace it. If so, switch to that tool. Otherwise, explain your motivation, then ask
the user.
```

**Token impact**: one extra short user-role message per rejected tool call (the rewritten error). The token cost is bounded by the configured text length, not by tool execution.

**KV-cache effect**: `Does not invalidate`. The plugin preserves the existing turn prefix; no prompt or schema owned by this package changes across turns. Cache availability and eviction remain governed by the LLM provider.

**Independent model requests**: none. The plugin never issues LLM calls.

## Known Limitations and Deferred Work

- **Rejection detection** prefers the structured identity `error.info = { name: 'ApprovalError', code: 'APPROVAL_REJECTED' }` that DSH `0.2.2-rc.3`+ records on the denied tool result (`packages/core/tools/src/error-codes.ts:9-12`); only `APPROVAL_REJECTED` counts, not `APPROVAL_CANCELLED` / `APPROVAL_UNAVAILABLE`. On hosts whose approval denial carries no `error.info` (`0.2.1-rc.*` / `0.2.2-rc.1`) it falls back to the literal `OFFICIAL_REJECTION_TEMPLATE` `the user rejected tool "<name>"`; if upstream ever rewrites that string, the fallback path silently stops detecting rejections. `pnpm run ci:drift` (wired into `pnpm test` / `pnpm build`) scans the installed `@deepseek-ai/dsh-tools` package (unpacked `src/` when shipped, otherwise the published `lib/*.js` chunks) for both the prefix and the `APPROVAL_REJECTED` code, and exits 1 if either has drifted — run `pnpm test` or `pnpm build` after upgrading DSH to catch this locally. The literal has already moved twice — `src/index.ts` on `0.2.0-rc.*` / `0.2.1-rc.*` (line `1755` → `1763`), published as `lib/index.js`, then `src/pipeline.ts` / published `lib/pipeline.js` on `0.2.2-rc.1`+ (`:460` on rc.1, `:468` on rc.3). Published tarballs carried only `lib/` and `locale/` through `0.2.2-rc.1`; `0.2.2-rc.3` also ships `src`, so the guard reads whichever layout is installed.
- **The rewrite still targets `error.message`.** Upstream's `ToolErrorInfo.reason` is durable-only — its comment states that model-facing content does not include it — so changing what the model reads still requires rewriting the message. The plugin passes the original `error.info` through on its `block` decision, so downstream consumers keep seeing the approval identity after a rewrite.
- **Coverage** is limited to tool calls that go through the agent loop. Harness-internal bash and other out-of-loop tool calls are not observable here.
- **`mode` defaults to `'stop'`**, which closes the turn on the very first rejection. Consumers that want "rewrite only, never halt" should set `mode: 'default'` at install time or toggle it through the Plugins page.
- **The card exposes only `mode`.** `stopOnRejectTools` is runtime-editable through `ctx.settings.update` but has no UI control on the row page yet.
- **Plugins page availability** (host behavior on `0.2.2-rc.1`+): the page is gated by `remoteAccess.whenAccess('pluginManager/listBundles')`, so the row's Configure page (`plugins.row.config`) only mounts for the owner session — that endpoint is `owner-only` (`packages/experimental/liveshare/src/endpoint-classification.ts:144` on `0.2.2-rc.1`, `:147` on `0.2.2-rc.3`), and any non-owner Peer (restricted or unrestricted) lacks it. In that case message rewriting still works — only the settings card is absent. Runtime edits through `ctx.settings.update` are unaffected.

## Reference

- [docs/DESIGN.md](./docs/DESIGN.md) — design rationale, implementation mechanism, rejected alternatives.
- [docs/UPGRADE-0.1.7-LESSONS.md](./docs/UPGRADE-0.1.7-LESSONS.md) — the 0.1.7-rc.2 migration retrospective: live-test matrix, pitfalls (version floors, volatile typing, the retired Settings entry), and a reusable upgrade checklist.
- `@deepseek-ai/dsh-tools` — upstream approval rejection flow that this plugin detects (`packages/core/tools/src/pipeline.ts:468` on `0.2.2-rc.3`, `:460` on `0.2.2-rc.1`; `src/index.ts:1763` on `0.2.1-rc.*`, `1755` on `0.2.0-rc.*`).

## Verification

Building and verifying against the `0.2.2-rc.3` devDeps requires Node `>= 24.9.0` (that toolchain dropped Node 22). The published plugin has no separate Node floor of its own — it runs on whatever Node the host runs.

```sh
pnpm install
pnpm run typecheck
pnpm run typecheck:client
pnpm run ci:drift
pnpm run test
pnpm run build
```

`pnpm run test` runs the in-tree smoke test (`tests/reject-policy-check.mts`); it asserts 25 checks across 8 cases covering mode toggles, message resolution, template substitution, tool-scope filtering, and the structured rejection identity (`error.info` hit, `info` pass-through, `APPROVAL_CANCELLED` / `APPROVAL_UNAVAILABLE` not counting, literal fallback when `info` is absent).
