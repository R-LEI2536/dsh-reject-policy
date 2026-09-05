/**
 * Client half: register one card into the existing Plugins section under
 * the `reject-policy` key. The Plugins section's keyed dispatch pairs the
 * key against the namespaces the Host serves; both halves of this plugin
 * (host `ctx.settings.installSection` + client card) keyed `reject-policy`
 * join automatically without any registry glue.
 *
 * The card binds `ctx.settingsScope` to the same namespace the host
 * registered, so user writes flow through `scope.set` / `scope.unset`
 * and land in the host's settings document on the next describe round.
 *
 * DSH 0.1.2-rc.1: `@deepseek-ai/dsh-client-runtime` was split —
 * `ClientContext` now lives on `@deepseek-ai/cordis`'s `Context`, the
 * `SettingsScope<T>` type / `ctx.settingsScope` binder lives on
 * `@deepseek-ai/dsh-client-ui-settings`, and `ctx.slots` on
 * `@deepseek-ai/dsh-client-ui-renderer`. Each is a Cordis service merge;
 * importing the `/client` entry pulls the merge into this file's view.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings.SlotMap merge (the `settings.section` and
// `settings.plugin.item` seats, plus the `ctx.settingsScope` and
// `ctx.settingsSchema` services). Cross-plugin collaboration goes through
// cordis services; a value import would fail the client bundle purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the `ctx.slots` Context merge (SlotRegistry). The
// plugins `ui-settings-plugins` package owns the runtime service; this
// just makes `ctx.slots.*` type-check here.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `settings.plugin.item` slot declaration (the keyed
// seat under the Plugins section's configurable tab) into the SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Type-only: pulls the `ctx.locale` Context merge (LocaleRuntime) and the
// LocaleNamespaceMap seat on @deepseek-ai/dsh-client-ui-slots. Without it
// `ctx.locale.register` and the augmentation below fail to type-check.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Import the slot key from `../shared`, NOT from `../index`. The client bundle
// purity gate forbids importing anything from the host runtime tree, because
// `../index` pulls in `@deepseek-ai/schemastery` (a non-EXTERNAL runtime
// value), which the loader's module table does not answer.
import { REJECT_POLICY_SETTINGS_NAMESPACE } from '../shared'
import { RejectPolicyCard, type RejectPolicyCardInjected } from './RejectPolicyCard'
import { en, zh, type RejectPolicyKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The reject-policy card copy. */
    'reject-policy': RejectPolicyKey
  }
}

/** Dictionary namespace owned by this card. */
const NS = 'reject-policy'

/** Keyed slot entry — must match the host's `REJECT_POLICY_SETTINGS_NAMESPACE`. */
const KEY = REJECT_POLICY_SETTINGS_NAMESPACE

/** Required services: slot registry, locale registry, settings scope. */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Client plugin body: register the card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'reject-policy: card dictionary',
  )

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: KEY,
    locale: NS,
    inject: (): RejectPolicyCardInjected => ({
      // Bind the scope on the caller's plugin lifecycle — the scope's
      // disposer is owned by this plugin's fiber. Binding adds no wire
      // read of its own because settings reads ride the shared describe
      // mirror (every settings consumer in the browser subscribes to the
      // same `SettingsDescribeMirror` owned by `ui-settings`).
      scope: ctx.settingsScope.bind({ namespace: KEY }),
    }),
  }, RejectPolicyCard))
}