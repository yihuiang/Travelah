import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { resolveAvatarUrl } from '../utils/avatar.js'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

function isValidEmail(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

function EditPasswordField({ id, label, value, onChange, disabled, autoComplete, minLength }) {
  const [show, setShow] = useState(false)

  return (
    <div className="edit-field-group">
      <label className="edit-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="edit-password-wrap">
        <input
          id={id}
          className="edit-field-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          minLength={minLength}
        />
        <button
          type="button"
          className="btn-edit-toggle-pw"
          onClick={() => setShow((v) => !v)}
          disabled={disabled}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          <span className="material-symbols-outlined">{show ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>
    </div>
  )
}

export default function ProfileEditView({
  profile,
  onSavePersonal,
  onSavePassword,
  onUploadAvatar,
  onRemoveAvatar,
  personalSubmitting,
  passwordSubmitting,
  avatarUploading,
  personalError,
  passwordError,
  avatarError,
}) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null)
  const [avatarPickError, setAvatarPickError] = useState(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [personalSuccess, setPersonalSuccess] = useState(false)
  const [emailError, setEmailError] = useState(null)
  const avatarInputRef = useRef(null)
  const personalSuccessTimer = useRef(null)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName || '')
    setEmail(profile.email || '')
    setAvatarPreview(resolveAvatarUrl(profile.avatarUrl))
  }, [profile?.id, profile?.displayName, profile?.email, profile?.avatarUrl])

  useEffect(() => {
    if (!profile) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPendingAvatarFile(null)
    setAvatarPickError(null)
    setPasswordOpen(false)
    setPersonalSuccess(false)
    setEmailError(null)
  }, [profile?.id])

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview)
      }
      if (personalSuccessTimer.current) {
        clearTimeout(personalSuccessTimer.current)
      }
    }
  }, [avatarPreview])

  const { t } = useLanguage()

  if (!profile) return null

  const initial = (displayName || profile.username || '?').charAt(0).toUpperCase()
  const busy = personalSubmitting || passwordSubmitting || avatarUploading
  const hasPendingPhoto = Boolean(pendingAvatarFile)
  const showRemovePhoto = (avatarPreview || resolveAvatarUrl(profile.avatarUrl)) && !hasPendingPhoto

  function handleAvatarPick(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setAvatarPickError(null)

    if (!file) return

    if (!AVATAR_ACCEPT.split(',').includes(file.type)) {
      setAvatarPickError('Please choose a JPEG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarPickError('Image must be 2 MB or smaller.')
      return
    }

    if (avatarPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview)
    }
    setPendingAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function cancelPendingPhoto() {
    if (avatarPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview)
    }
    setPendingAvatarFile(null)
    setAvatarPickError(null)
    setAvatarPreview(resolveAvatarUrl(profile.avatarUrl))
  }

  async function confirmPendingPhoto() {
    if (!pendingAvatarFile || !onUploadAvatar) return
    setAvatarPickError(null)
    try {
      await onUploadAvatar(pendingAvatarFile)
      setPendingAvatarFile(null)
    } catch {
      // Parent sets avatarError; keep preview so user can retry.
    }
  }

  async function handleSavePersonalClick(event) {
    event.preventDefault()
    setPersonalSuccess(false)

    const trimmedEmail = email.trim()
    if (!isValidEmail(trimmedEmail)) {
      setEmailError(t('Please enter a valid email'))
      return
    }
    setEmailError(null)

    const ok = await onSavePersonal({
      displayName: displayName.trim(),
      email: trimmedEmail,
    })
    if (ok) {
      setPersonalSuccess(true)
      if (personalSuccessTimer.current) clearTimeout(personalSuccessTimer.current)
      personalSuccessTimer.current = setTimeout(() => setPersonalSuccess(false), 2500)
    }
  }

  async function handleSavePasswordClick(event) {
    event.preventDefault()
    if (newPassword && newPassword !== confirmPassword) {
      onSavePassword({ validationError: 'New passwords do not match' })
      return
    }
    const ok = await onSavePassword({
      currentPassword: currentPassword || undefined,
      newPassword: newPassword || undefined,
    })
    if (ok) {
      closePasswordForm()
    }
  }

  function closePasswordForm() {
    setPasswordOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="profile-edit-grid">
      <aside className="edit-avatar-card">
        <span className="material-symbols-outlined edit-avatar-watermark">local_florist</span>

        <div className="edit-avatar-wrap">
          {avatarPreview ? (
            <img
              className="edit-avatar-img"
              src={avatarPreview}
              alt={displayName || profile.displayName}
            />
          ) : (
            <div className="edit-avatar-initial">{initial}</div>
          )}
          {hasPendingPhoto && <span className="edit-avatar-preview-badge">{t('Preview')}</span>}
          <button
            type="button"
            className="btn-edit-avatar-pick"
            disabled={busy}
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Change profile photo"
          >
            <span className="material-symbols-outlined">edit</span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            hidden
            onChange={handleAvatarPick}
          />
        </div>

        {hasPendingPhoto && (
          <div className="edit-avatar-confirm">
            <p>{t('Happy with this photo?')}</p>
            <button
              type="button"
              className="btn-edit-done"
              disabled={avatarUploading}
              onClick={confirmPendingPhoto}
            >
              {avatarUploading ? t('Saving…') : t('Done')}
            </button>
            <button
              type="button"
              className="btn-edit-cancel-photo"
              disabled={avatarUploading}
              onClick={cancelPendingPhoto}
            >
              {t('Cancel')}
            </button>
          </div>
        )}

        {(avatarPickError || avatarError) && (
          <p className="edit-avatar-error">{avatarPickError || avatarError}</p>
        )}

        <h2 className="edit-avatar-name">{displayName || profile.displayName}</h2>
        <p className="edit-avatar-email">{email || profile.email || t('No email set')}</p>

        <span className="edit-avatar-tier">
          <span className="material-symbols-outlined">workspace_premium</span> {t('Explorer tier')}
        </span>

        {showRemovePhoto && (
          <button
            type="button"
            className="btn-edit-remove-photo"
            disabled={busy}
            onClick={async () => {
              if (!onRemoveAvatar) return
              setAvatarPickError(null)
              try {
                await onRemoveAvatar()
                if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
                setPendingAvatarFile(null)
                setAvatarPreview(null)
              } catch {
                // Parent sets avatarError
              }
            }}
          >
            {t('Remove photo')}
          </button>
        )}
      </aside>

      <div className="edit-forms-col">
        <form className="edit-form-card" onSubmit={handleSavePersonalClick} noValidate>
          <span className="material-symbols-outlined edit-form-watermark">badge</span>
          <h2 className="edit-form-title">{t('Personal Information')}</h2>

          <div className="edit-field-group">
            <label className="edit-field-label" htmlFor="edit-full-name">
              {t('Full name')}
            </label>
            <input
              id="edit-full-name"
              className="edit-field-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
              disabled={busy}
            />
          </div>

          <div className="edit-field-group">
            <label className="edit-field-label" htmlFor="edit-email">
              {t('Email')}
            </label>
            <input
              id="edit-email"
              className={`edit-field-input${emailError ? ' is-invalid' : ''}`}
              type="text"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
              onBlur={() => {
                const trimmed = email.trim()
                if (trimmed && !isValidEmail(trimmed)) {
                  setEmailError(t('Please enter a valid email'))
                }
              }}
              placeholder="you@example.com"
              disabled={busy}
              aria-invalid={emailError ? 'true' : undefined}
              aria-describedby={emailError ? 'edit-email-error' : undefined}
            />
            {emailError && (
              <p id="edit-email-error" className="edit-field-hint" role="alert">
                <span className="material-symbols-outlined" aria-hidden="true">
                  error
                </span>
                {emailError}
              </p>
            )}
          </div>

          {personalError && <p className="edit-form-error">{personalError}</p>}
          {personalSuccess && (
            <p className="edit-form-success" role="status">
              <span className="material-symbols-outlined">check_circle</span> {t('Save successful')}
            </p>
          )}

          <div className="edit-form-actions">
            <button type="submit" className="btn-edit-save" disabled={personalSubmitting}>
              {personalSubmitting ? t('Saving…') : t('Save Changes')}
            </button>
          </div>
        </form>

        <div className="edit-form-card">
          <span className="material-symbols-outlined edit-form-watermark">lock</span>
          <h2 className="edit-form-title">{t('Security')}</h2>

          <div className="edit-security-row">
            <div>
              <p className="edit-security-title">{t('Password')}</p>
              <p className="edit-security-sub">{t('Update your account password')}</p>
            </div>
            {!passwordOpen && (
              <button
                type="button"
                className="btn-edit-text"
                disabled={busy}
                onClick={() => setPasswordOpen(true)}
              >
                {t('Change Password')}
              </button>
            )}
          </div>

          {passwordOpen && (
            <form className="edit-password-form" onSubmit={handleSavePasswordClick}>
              <EditPasswordField
                id="edit-current-password"
                label="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={passwordSubmitting}
                autoComplete="current-password"
              />
              <EditPasswordField
                id="edit-new-password"
                label="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passwordSubmitting}
                autoComplete="new-password"
                minLength={8}
              />
              <EditPasswordField
                id="edit-confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={passwordSubmitting}
                autoComplete="new-password"
              />

              {passwordError && <p className="edit-form-error">{passwordError}</p>}

              <div className="edit-password-actions">
                <button
                  type="button"
                  className="btn-edit-outline"
                  disabled={passwordSubmitting}
                  onClick={closePasswordForm}
                >
                  {t('Cancel')}
                </button>
                <button type="submit" className="btn-edit-save" disabled={passwordSubmitting}>
                  {passwordSubmitting ? t('Updating…') : t('Update Password')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
