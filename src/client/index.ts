/**
 * Client half: two surfaces over the one `reject-policy` namespace.
 *
 * 1. The configuration page for the `reject-policy` row on the Plugins
 *    page (`plugins.row.config`, key `REJECT_POLICY_ROW_CONFIG_KEY`). The
 *    row gains a **Configure** control; the page owns title, crumb, and
 *    description chrome.
 *
 * 2. The composer-dock mode switch (`conversation.input.dock`, id
 *    `reject-policy`): a persistent strip above the composer showing the
 *    live `mode` and toggling it in place. The dock binds its own shared
 *    form (`ctx.configForms.get(...)`) instead of a page-supplied one, so
 *    it lives on the conversation surface, not inside the Plugins page.
 *
 * Both edits ride the shared settings describe mirror and the one Host
 * write queue, so they can never disagree. Both registrations are gated on
 * `ctx.configForms.whileServed(['reject-policy'])` so a deployment that
 * never composes this plugin shows no trace of either surface.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings domain's Context merge (`ctx.configForms` —
// `ConfigForms.get` / `whileServed`). Cross-plugin collaboration goes through
// cordis services; a value import would fail the client bundle purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.row.config'
// entry) into the program.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: pulls the Conversation SlotMap merge (the
// 'conversation.input.dock' entry and its owner props) into the program.
// Pure types — no runtime import, so it stays out of `dsh.client.inject`
// and tsdown's EXTERNAL list (see the sync note in `tsdown.config.ts`).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the `ctx.slots` Context merge (SlotRegistry).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `ctx.locale` Context merge (LocaleRuntime) and the
// LocaleNamespaceMap seat on @deepseek-ai/dsh-client-ui-slots. Without it
// `ctx.locale.register` and the augmentation below fail to type-check.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Import the constant surface from `../shared`, NOT from `../index`. The client
// bundle purity gate forbids importing anything from the host runtime tree,
// because `../index` pulls in `@deepseek-ai/schemastery` (a non-EXTERNAL runtime
// value), which the loader's module table does not answer.
import { REJECT_POLICY_ROW_CONFIG_KEY, REJECT_POLICY_SETTINGS_NAMESPACE } from '../shared'
import type { RejectPolicySettings } from '../shared'
import { RejectPolicyCard } from './RejectPolicyCard'
import { RejectPolicyDock, type RejectPolicyDockInjected } from './RejectPolicyDock'
import { en, zh, type RejectPolicyKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The reject-policy card + dock copy. */
    'reject-policy': RejectPolicyKey
  }
}

/** Dictionary namespace owned by these surfaces. */
const NS = 'reject-policy'

/** Required services: slot registry, locale registry, settings forms. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Client plugin body: register the row configuration page and the
 * composer-dock mode switch.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'reject-policy: card dictionary',
  )

  ctx.effect(
    () => ctx.configForms.whileServed(
      [REJECT_POLICY_SETTINGS_NAMESPACE],
      () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: REJECT_POLICY_ROW_CONFIG_KEY,
        locale: NS,
      }, RejectPolicyCard)),
    ),
    'reject-policy: plugins row config page',
  )

  ctx.effect(
    () => ctx.configForms.whileServed(
      [REJECT_POLICY_SETTINGS_NAMESPACE],
      () => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'reject-policy',
        // Between the GoalBar (order 10) and the Queue dock (order 20): the
        // Queue dock must stay the LAST strip entry — its negative bottom
        // margin tucks it under the composer card, and a later sibling would
        // break that seam.
        order: 15,
        locale: NS,
        inject: (): RejectPolicyDockInjected => ({
          // Provider-owned shared form: the same snapshot and write queue
          // the Plugins-page card edits, so the two surfaces cannot
          // disagree. `get` caches per namespace, so this is one instance.
          form: ctx.configForms.get<RejectPolicySettings>(REJECT_POLICY_SETTINGS_NAMESPACE),
        }),
      }, RejectPolicyDock)),
    ),
    'reject-policy: composer dock switch',
  )
}