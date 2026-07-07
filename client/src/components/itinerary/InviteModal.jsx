import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, getAuthToken } from '../../context/AuthContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { resolveAvatarUrl } from '../../utils/avatar.js'

function MemberAvatar({ member }) {
  const initials = (member.displayName || '?').slice(0, 2).toUpperCase()
  const avatarSrc = resolveAvatarUrl(member.avatarUrl)
  return (
    <div className="invite-member-avatar">
      {avatarSrc
        ? <img src={avatarSrc} alt={member.displayName} />
        : <span>{initials}</span>}
    </div>
  )
}

export default function InviteModal({ open, onClose, tripId, tripTitle, initialMembers = [], onMembersChange }) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const token = getAuthToken()

  const [invite, setInvite] = useState(null)   // { code, link, expiresAt }
  const [members, setMembers] = useState(initialMembers)

  // Sync if parent updates members (e.g. after remove)
  const updateMembers = (next) => {
    setMembers(next)
    onMembersChange?.(next)
  }
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(null) // null | 'link' | 'code'
  const [removingId, setRemovingId] = useState(null)
  const overlayRef = useRef(null)

  const isOwner = members.length > 0 && members[0]?.userId === user?.id

  const load = useCallback(async () => {
    if (!tripId || !token) return
    setLoading(true)
    try {
      const [invRes, memRes] = await Promise.all([
        fetch(`/api/trips/${tripId}/invite`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }).then((r) => r.json()),
        fetch(`/api/trips/${tripId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
      ])
      if (invRes.code) setInvite(invRes)
      if (Array.isArray(memRes.members)) updateMembers(memRes.members)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [tripId, token])

  useEffect(() => {
    if (open) load()
    else { setInvite(null); setMembers([]); setCopied(null) }
  }, [open, load])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function copyLink() {
    if (!invite?.link) return
    try {
      await navigator.clipboard.writeText(invite.link)
      setCopied('link')
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  async function copyCode() {
    if (!invite?.code) return
    try {
      await navigator.clipboard.writeText(invite.code)
      setCopied('code')
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  async function removeMember(memberId) {
    if (!isOwner || removingId) return
    setRemovingId(memberId)
    try {
      await fetch(`/api/trips/${tripId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      updateMembers(members.filter((m) => m.userId !== memberId))
    } catch {
      // ignore
    } finally {
      setRemovingId(null)
    }
  }

  if (!open) return null

  return (
    <div
      className="invite-overlay"
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      aria-modal="true"
      role="dialog"
    >
      <div className="invite-modal">
        <div className="invite-modal-head">
          <h2 className="invite-modal-title">{t('Invite friends')}</h2>
          <button type="button" className="invite-modal-close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading && !members.length ? (
          <div className="invite-loading">
            <span className="material-symbols-outlined spin">hourglass_empty</span>
          </div>
        ) : (
          <>
            {/* Members list */}
            {members.length > 0 && (
              <div className="invite-members">
                {members.map((m) => (
                  <div key={m.userId} className="invite-member-row">
                    <MemberAvatar member={m} />
                    <div className="invite-member-info">
                      <span className="invite-member-name">{m.displayName}</span>
                      <span className="invite-member-role">{t(m.role === 'owner' ? 'Organizer' : 'Member')}</span>
                    </div>
                    {isOwner && m.userId !== user?.id && (
                      <button
                        type="button"
                        className="invite-member-remove"
                        onClick={() => removeMember(m.userId)}
                        disabled={removingId === m.userId}
                        aria-label={`Remove ${m.displayName}`}
                      >
                        <span className="material-symbols-outlined">
                          {removingId === m.userId ? 'hourglass_empty' : 'person_remove'}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Share section */}
            {invite && (
              <div className="invite-share">
                <p className="invite-share-label">{t('Share trip')}</p>

                {/* Method 1: invite link */}
                <div className="invite-method">
                  <div className="invite-method-head">
                    <span className="material-symbols-outlined">link</span>
                    <div>
                      <span className="invite-method-title">{t('Invite link')}</span>
                      <span className="invite-method-desc">{t('Recipient clicks the link → instantly joins')}</span>
                    </div>
                  </div>
                  <button type="button" className="invite-link-btn" onClick={copyLink}>
                    <span className="material-symbols-outlined">{copied === 'link' ? 'check' : 'content_copy'}</span>
                    <span>{copied === 'link' ? t('Copied!') : t('Copy link')}</span>
                  </button>
                </div>

                {/* Method 2: code */}
                <div className="invite-method">
                  <div className="invite-method-head">
                    <span className="material-symbols-outlined">pin</span>
                    <div>
                      <span className="invite-method-title">{t('Invite code')}</span>
                      <span className="invite-method-desc">{t('Recipient types this code on the Trips page')}</span>
                    </div>
                  </div>
                  <div className="invite-code-row">
                    <span className="invite-code-value">{invite.code}</span>
                    <button type="button" className="invite-code-copy" onClick={copyCode}>
                      <span className="material-symbols-outlined">{copied === 'code' ? 'check' : 'content_copy'}</span>
                      {copied === 'code' ? t('Copied!') : t('Copy')}
                    </button>
                  </div>
                </div>

                <p className="invite-expire-hint">
                  <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle' }}>schedule</span>
                  {' '}{t('Expires in 7 days · max 50 uses')}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
