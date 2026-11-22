/**
 * RejectPolicyDock — the persistent `mode` switch chip in the composer's
 * tool row.
 *
 * Registered into `conversation.input.left` (the row that also carries the
 * permission chip, the plan seat, and the third-party approval-mode chip,
 * order 20 so it trails the approval chip). The row shows the live `mode`
 * at a glance and toggles it in place: no page navigation and no staged
 * Save, because `mode` is a per-task runtime rule, not install
 * configuration — burying it behind Plugins → Configure → Save makes the
 * toggle effectively unreachable mid-conversation.
 *
 * Reads and writes ride the SAME shared settings form the Plugins-page card
 * edits (`ctx.configForms.get(REJECT_POLICY_SETTINGS_NAMESPACE)` in the
 * registering `src/client/index.ts`), so the chip and the card can never
 * disagree: both re-render from the one describe mirror, and both write
 * through the one Host write queue. Reverting to the composition base
 * clears the user override (`unset`) instead of writing a redundant one —
 * the same rule the card applies on Save.
 *
 * Renders nothing while the namespace is not served or the mirror has not
 * accepted a section yet (`status !== 'ready'`). A read-only settings
 * provider (`writable === false`; the shipped one always reports writable)
 * keeps the switch visibly inert — the chip dims via `aria-disabled` and
 * the tooltip explains through the shared `readOnly` copy. The button never
 * takes a real `disabled` attribute: disabled buttons fire no hover/focus
 * events, which would make that explanation unreachable.
 */
import { useCallback, useState, useSyncExternalStore, type ReactElement } from 'react'
import { IconShieldOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the Conversation slot map entry ('conversation.input.left')
// and its owner props into the program. No runtime import — see
// the purity-gate notes in RejectPolicyCard.tsx.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: `ConfigForm` / `ConfigFormSnapshot` carriers.
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Import the pure type surface from `../shared`, NOT from `../index`.
import type { RejectMode, RejectPolicySettings } from '../shared'
import css from './RejectPolicyDock.module.css'

/** Props injected by the registering plugin (see `src/client/index.ts`). */
export interface RejectPolicyDockInjected {
  /** Shared form over the `reject-policy` namespace (provider-owned, stable). */
  form: ConfigForm<RejectPolicySettings>
}

/** Full component props: slot owner share + injected form + locale copy. */
export type RejectPolicyDockProps =
  & PropsRuntime<'conversation.input.left'>
  & InjectFace<RejectPolicyDockInjected>
  & PropsLocale<'reject-policy'>

/**
 * Render the composer tool-row mode chip, or nothing while the namespace is
 * not served yet.
 * @param props - the shared settings form plus the locale seat.
 * @returns the switch chip, or null before the first mirror section.
 */
export function RejectPolicyDock({ form, t }: RejectPolicyDockProps): ReactElement | null {
  // `ConfigForm`'s `subscribe` / `getSnapshot` are prototype methods reading
  // `this` (the form's snapshot store) — pass stable bound callbacks, never
  // the bare method references, or React's bare call crashes on mount.
  const subscribe = useCallback((onChange: () => void) => form.subscribe(onChange), [form])
  const getSnapshot = useCallback(() => form.getSnapshot(), [form])
  const snapshot: ConfigFormSnapshot<RejectPolicySettings> =
    useSyncExternalStore(subscribe, getSnapshot)
  const [pending, setPending] = useState(false)
  /** Optimistic target while the write round-trip is in flight. */
  const [optimistic, setOptimistic] = useState<RejectMode | null>(null)
  const [failed, setFailed] = useState(false)
  /** Last mode whose write landed — drives the screen-reader announcement. */
  const [landed, setLanded] = useState<RejectMode | null>(null)

  if (snapshot.status !== 'ready') return null

  // Layered resolution, identical to the Plugins-page card: absent user keys
  // fall back to the composition `base`; absent base falls back to the
  // schema default ('stop'). The runtime exposes `base` as `unknown`; the
  // plugin's volatile Config narrows it back here.
  const base = snapshot.base as RejectPolicySettings | undefined
  const baseMode: RejectMode = base?.mode ?? 'stop'
  const persisted: RejectMode = snapshot.value?.mode ?? baseMode
  // The optimistic target shows during the mutate round-trip; the describe
  // mirror's value takes over as soon as it accepts the write.
  const mode: RejectMode = optimistic ?? persisted
  const writable = snapshot.writable

  const onToggle = async (): Promise<void> => {
    if (pending || !writable) return
    setPending(true)
    setFailed(false)
    const target: RejectMode = mode === 'stop' ? 'default' : 'stop'
    setOptimistic(target)
    let landedNow = false
    try {
      landedNow = target === baseMode
        // Reverting to the composition base clears the user override
        // instead of writing a redundant one — the same rule the card
        // applies on Save.
        ? await form.unset('mode')
        : await form.set('mode', target)
    } catch (_writeFailure) {
      landedNow = false
    }
    setPending(false)
    setOptimistic(null)
    if (landedNow) setLanded(target)
    setFailed(!landedNow)
  }

  const stop = mode === 'stop'
  const tooltip = !writable
    ? t('readOnly')
    : t(stop ? 'dock.hint.stop' : 'dock.hint.default')

  return (
    <>
      <Tooltip portal label={tooltip} side="top" delayMs={500}>
        <button
          type="button"
          role="switch"
          aria-checked={stop}
          className={`${css.trigger} ${pending ? css.pending : ''}`}
          aria-disabled={!writable}
          aria-busy={pending}
          // Stable accessible name: the switch's state lives in
          // `aria-checked`, not in a relabeled name.
          aria-label={t('dock.title')}
          onClick={() => { void onToggle() }}
        >
          <span className={css.glyph} aria-hidden><IconShieldOutlineRegular size={14} /></span>
          <span className={css.label}>{t('dock.title')}</span>
          <span className={css.mode} data-mode={mode}>
            {t(stop ? 'dock.mode.stop' : 'dock.mode.default')}
          </span>
        </button>
      </Tooltip>
      {landed !== null ? (
        <span className={css.srOnly} role="status">
          {`${t('dock.title')}: ${t(landed === 'stop' ? 'dock.mode.stop' : 'dock.mode.default')}`}
        </span>
      ) : null}
      {failed ? <span className={css.error} role="alert">{t('dock.saveFailed')}</span> : null}
    </>
  )
}
