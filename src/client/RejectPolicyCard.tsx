/**
 * RejectPolicyCard — the `plugins.row.config` page for dsh-reject-policy.
 *
 * Rendered inside the Plugins page's row detail view (opened from the
 * Configure control on the `reject-policy` row of the `dsh-reject-policy`
 * bundle). The page owns the title, crumb, icon, and description chrome and
 * drops staged edits when the page is left; this card draws only the form:
 * one dropdown (Stop / Default) staged locally, written on Save.
 *
 * Values come from the page-supplied `form` (`ConfigPageForm`): `form.state`
 * is the live snapshot of the `reject-policy` namespace on the shared
 * settings describe mirror, and `form.mutate` writes the plugin entry's
 * volatile Config into the profile patch. When the staged edit equals the
 * composition `base`, the card clears the user layer (`op: 'unset'`) instead
 * of writing a redundant override.
 *
 * `view === 'summary'` renders the one-liner the page uses as the row's
 * description fallback when the bundle supplies no description.
 */
import { useRef, useState, type ReactElement } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the Plugins page's SlotMap merge ('plugins.row.config') and the
// `ConfigPageForm` owner props it supplies.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: `ConfigFormSnapshot` (the state carrier inside `ConfigPageForm`).
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Import the pure type surface from `../shared`, NOT from `../index`.
// `../index` pulls in `@deepseek-ai/schemastery` as a runtime value; doing so
// would drag a `require("@deepseek-ai/schemastery")` into the client bundle,
// but the loader's module table does not register schemastery as a seed
// word or package factory, so the plugin would fail to load with
// "missed the module table".
import type { RejectMode, RejectPolicySettings } from '../shared'
import { REJECT_MODES } from '../shared'
import css from './RejectPolicyCard.module.css'

/** Full component props: Plugins page runtime seat + locale copy. */
export type RejectPolicyCardProps =
  & PropsRuntime<'plugins.row.config'>
  & PropsLocale<'reject-policy'>
  & InjectFace<Record<string, never>>

/**
 * Render the reject-policy configuration page.
 * @param props - the plugin view asked for, or the form with its snapshot and write actions.
 * @returns the one-liner, the form, or nothing while the namespace is not served.
 */
export function RejectPolicyCard(props: RejectPolicyCardProps): ReactElement | null {
  const { t, view } = props
  if (view === 'summary') return <p className={css.summary}>{t('description')}</p>

  const form = props.form
  const snapshot = form?.state as ConfigFormSnapshot<RejectPolicySettings> | undefined
  if (form === undefined || snapshot === undefined || snapshot.status !== 'ready') return null

  // Layered resolution: user overrides base; absent user keys fall back to
  // base; absent base falls back to the schema default ('stop').
  // The runtime exposes `base` as `unknown`; the plugin's volatile Config
  // narrows it back to `RejectPolicySettings` here.
  const base: RejectPolicySettings | undefined = snapshot.base as RejectPolicySettings | undefined
  const baseValue: RejectMode = base?.mode ?? 'stop'
  const savedValue: RejectMode = snapshot.value?.mode ?? baseValue

  const [staged, setStaged] = useState<RejectMode | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)

  const draftValue: RejectMode = staged ?? savedValue
  const dirty = staged !== undefined && staged !== savedValue
  const writable = snapshot.writable

  const onPick = (id: string): void => {
    setMenuOpen(false)
    if (id === 'stop' || id === 'default') {
      setStaged(id)
    }
  }

  const onSave = async (): Promise<void> => {
    if (!dirty || !writable || staged === undefined) return
    setSaving(true)
    setFailed(false)
    let landed = false
    try {
      if (staged === baseValue) {
        // The staged edit matches the composition `base`: clear the user
        // override instead of writing a redundant value.
        landed = await form.mutate([{ op: 'unset', path: ['mode'] }])
      } else {
        landed = await form.mutate([{ op: 'set', path: ['mode'], value: staged }])
      }
    } catch (_writeFailure) {
      landed = false
    }
    setSaving(false)
    setFailed(!landed)
    if (landed) setStaged(undefined)
  }

  const onDiscard = (): void => {
    if (!dirty) return
    setStaged(undefined)
    setFailed(false)
  }

  const labelFor = (value: RejectMode): string =>
    t(value === 'stop' ? 'option.stop' : 'option.default')

  return (
    <div className={css.page}>
      {!writable ? (
        <p className={css.readOnly} role="status">{t('readOnly')}</p>
      ) : null}
      <div className={css.field}>
        <div className={css.fieldHead}>
          <span className={css.label}>{t('field.mode')}</span>
          <Menu
            open={menuOpen}
            anchor={(
              <button
                ref={anchorRef}
                type="button"
                className={`${css.dropdownTrigger} ${menuOpen ? css.dropdownOpen : ''}`}
                onClick={() => { setMenuOpen(!menuOpen) }}
                disabled={!writable}
              >
                <span>{labelFor(draftValue)}</span>
                <IconChevronDownOutlineRegular size={14} className={css.dropdownChevron} />
              </button>
            )}
            items={REJECT_MODES.map(mode => ({ id: mode, label: labelFor(mode) }))}
            selectedId={draftValue}
            onSelect={onPick}
            onClose={() => { setMenuOpen(false) }}
            side="bottom"
            align="start"
          />
        </div>
        <p className={css.hint}>{t('field.mode.hint')}</p>
      </div>
      <div className={css.footer}>
        {failed ? <p className={css.readOnly} role="status">{t('saveFailed')}</p> : null}
        <button
          type="button"
          className={css.discard}
          disabled={!dirty || saving}
          onClick={onDiscard}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          className={css.save}
          disabled={!dirty || !writable || saving}
          onClick={() => { void onSave() }}
        >
          {t(saving ? 'saving' : 'save')}
        </button>
      </div>
    </div>
  )
}