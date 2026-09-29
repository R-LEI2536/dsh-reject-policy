/**
 * Client half: register one configuration page for the `reject-policy` row
 * into the Plugins page's `plugins.row.config` slot.
 *
 * The row key (`<package name>#<row id>`, `REJECT_POLICY_ROW_CONFIG_KEY`)
 * pairs with the bundle this package ships: `dsh-reject-policy` with the
 * single row `reject-policy` the bundle patch declares. The row on the
 * bundle's Plugins page gains a **Configure** control that opens the page
 * this card renders; the page owns the title, crumb, and description chrome.
 *
 * The card edits the plugin entry's volatile Config through the page-supplied
 * `form` (`ConfigPageForm`): reads ride the shared settings describe mirror,
 * writes go through `form.mutate` / the Host's profile patch. Registration is
 * gated on `ctx.configForms.whileServed(['reject-policy'])` so a deployment
 * that never composes this plugin shows no trace of the page.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings domain's Context merge (`ctx.configForms` —
// `ConfigForms.get` / `whileServed`). Cross-plugin collaboration goes through
// cordis services; a value import would fail the client bundle purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.row.config'
// entry) into the program.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
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
import { RejectPolicyCard } from './RejectPolicyCard'
import { en, zh, type RejectPolicyKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The reject-policy card copy. */
    'reject-policy': RejectPolicyKey
  }
}

/** Dictionary namespace owned by this card. */
const NS = 'reject-policy'

/** Required services: slot registry, locale registry, settings forms. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Client plugin body: register the row configuration page.
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
}