/**
 * RejectPolicyCard — the Plugins-section card for dsh-reject-policy.
 *
 * Mirrors the disclosure chrome of `ui-settings-plugins/PluginCard`:
 *   - closed by default; the header button expands/collapses the body
 *   - one dropdown (Stop / Default) inside, staged locally, written on Save
 *   - pending state shown via the Save / Discard buttons' enabled flags
 *   - Discard drops the staged edit; Save writes via the settings scope
 *
 * The card reuses its own CSS rather than importing `PluginCard` /
 * `CardForm` from `ui-settings-plugins` — the bundle purity gate
 * forbids value imports across plugins, so the chrome lives next to
 * the card.
 */
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
// DSH 0.1.2-rc.1: `@deepseek-ai/dsh-client-runtime` was split; the per-namespace
// `SettingsScope<T>` host now ships from `@deepseek-ai/dsh-client-ui-settings`,
// whose `apply()` builds the `ctx.settingsScope` binder every preference row
// binds through. The reactive shape (`getSnapshot/subscribe/set/unset`) is the
// one this card already speaks.
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Import the pure type surface from `../shared`, NOT from `../index`.
// `../index` pulls in `@deepseek-ai/schemastery` as a runtime value; doing so
// would drag a `require("@deepseek-ai/schemastery")` into the client bundle,
// but the loader's module table does not register schemastery as a seed
// word or package factory, so the plugin would fail to load with
// "missed the module table".
import type { RejectMode, RejectPolicySettings } from '../shared'
import css from './RejectPolicyCard.module.css'

/** Injected business face from the client plugin. */
export interface RejectPolicyCardInjected {
  /** Live settings scope for the `reject-policy` namespace. */
  scope: SettingsScope<RejectPolicySettings>
}

/** Full component props: locale seat + injected scope. */
export type RejectPolicyCardProps =
  & PropsLocale<'reject-policy'>
  & InjectFace<RejectPolicyCardInjected>

/**
 * Render the reject-policy card.
 * @param props - locale copy and the bound settings scope.
 * @returns the card, or nothing while the namespace is not served.
 */
export function RejectPolicyCard(props: RejectPolicyCardProps): ReactElement | null {
  const { t } = props
  const scope = props.scope
  const snapshot = useSyncExternalStore(
    (cb) => scope.subscribe(cb),
    () => scope.getSnapshot(),
  )
  const available = snapshot.status === 'ready'
  if (!available) return null

  // Layered resolution: user overrides base; absent user keys fall back to
  // base; absent base falls back to the schema default.
  // For `mode` the host's installSection entry sets `base = 'stop'`, so the
  // base layer is always present once the host is mounted.
  // The runtime exposes `base` as `unknown`; the installSection contract
  // narrows it back to `RejectPolicySettings` here.
  const base: RejectPolicySettings | undefined = snapshot.base as RejectPolicySettings | undefined
  const baseValue: RejectMode = base?.mode ?? 'stop'
  const savedValue: RejectMode = snapshot.value?.mode ?? baseValue

  const [open, setOpen] = useState(false)
  // Staged draft: undefined means "no edit pending". A RejectMode means the
  // user picked one of the dropdown items and the change is waiting on Save.
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
    let landed = true
    try {
      if (staged === baseValue) {
        // The staged edit matches the cordis `base`: clear the user
        // override instead of writing a redundant value.
        await scope.unset('mode')
      } else {
        await scope.set('mode', staged)
      }
    } catch (_writeFailure) {
      landed = false
    }
    // The scope snapshot updates synchronously after set/unset on the
    // shared describe mirror; trust the new read-back rather than guess.
    const fresh = scope.getSnapshot()
    landed = landed && fresh.value?.mode === staged
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
    <li className={`${css.card} ${open ? css.cardOpen : ''}`}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        <IconChevronDownOutline14 size={14} className={css.chevron} />
      </button>
      {open ? (
        <div className={css.body}>
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
                    <IconChevronDownOutline14 size={14} className={css.dropdownChevron} />
                  </button>
                )}
                items={[
                  { id: 'stop', label: t('option.stop') },
                  { id: 'default', label: t('option.default') },
                ]}
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
      ) : null}
    </li>
  )
}