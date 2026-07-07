import {
  BUDGET_OPTIONS,
  DINING_OPTIONS,
  FOCUS_OPTIONS,
  PACE_OPTIONS,
  normalizePreferenceList,
} from '../constants/travelPreferences.js'
import { useLanguage } from '../context/LanguageContext.jsx'

function MultiSelectGroup({ label, options, selected, onChange }) {
  const { t } = useLanguage()
  const values = normalizePreferenceList(selected)

  function toggle(option) {
    const next = values.includes(option)
      ? values.filter((v) => v !== option)
      : [...values, option]
    onChange(next)
  }

  return (
    <div className="identity-option-group">
      <span className="identity-option-label">{label}</span>
      <div className="identity-option-chips">
        {options.map((option) => {
          const active = values.includes(option)
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              className={`identity-option-chip${active ? ' active' : ''}`}
              onClick={() => toggle(option)}
            >
              {t(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function IdentityPreferencesForm({
  preferences,
  onChange,
  onSubmit,
  submitting,
  error,
  variant = 'onboarding',
  onSkip,
}) {
  const { t } = useLanguage()
  const isOnboarding = variant === 'onboarding'

  return (
    <div className="identity-card">
      <span className="material-symbols-outlined identity-card-watermark">local_florist</span>
      <h2 className="identity-card-title">{t('Your travel identity')}</h2>
      <p className="identity-card-sub">
        {t('Select all that apply. We use this to tailor suggestions across Explore and Plan.')}
      </p>

      {error && (
        <p className="identity-form-error show" role="alert">
          {error}
        </p>
      )}

      <MultiSelectGroup
        label={t('Pace')}
        options={PACE_OPTIONS}
        selected={preferences.pace}
        onChange={(pace) => onChange({ ...preferences, pace })}
      />
      <MultiSelectGroup
        label={t('Focus')}
        options={FOCUS_OPTIONS}
        selected={preferences.focus}
        onChange={(focus) => onChange({ ...preferences, focus })}
      />
      <MultiSelectGroup
        label={t('Dining')}
        options={DINING_OPTIONS}
        selected={preferences.dining}
        onChange={(dining) => onChange({ ...preferences, dining })}
      />
      <MultiSelectGroup
        label={t('Budget')}
        options={BUDGET_OPTIONS}
        selected={preferences.budget}
        onChange={(budget) => onChange({ ...preferences, budget })}
      />

      <button
        type="button"
        className={`identity-btn-save${submitting ? ' loading' : ''}`}
        disabled={submitting}
        onClick={onSubmit}
      >
        <span className="identity-spinner" aria-hidden="true" />
        <span>{submitting ? t('Saving…') : isOnboarding ? t('Save & continue') : t('Save changes')}</span>
      </button>

      {isOnboarding && onSkip && (
        <button type="button" className="identity-btn-skip" onClick={onSkip}>
          {t('Skip for now')}
        </button>
      )}
    </div>
  )
}
