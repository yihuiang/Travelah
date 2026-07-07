function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.6 5.82a4.74 4.74 0 0 0 3.4-1.32V9.1a6.9 6.9 0 0 1-3.4-.88v6.58a5.52 5.52 0 1 1-5.52-5.52c.28 0 .55.02.82.07v3.43a2.12 2.12 0 1 0 1.5 2.03V5.82h2.2Z"
      />
    </svg>
  )
}

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', Icon: InstagramIcon, className: 'explore-social-icon--ig' },
  { id: 'tiktok', label: 'TikTok', Icon: TikTokIcon, className: 'explore-social-icon--dy' },
  {
    id: 'rednote',
    label: 'RedNote',
    imageSrc: '/icons/rednote.png',
    className: 'explore-social-icon--xhs explore-social-icon--logo',
  },
]

export default function ExploreSocialIcons() {
  return (
    <div className="explore-hero-social" aria-label="Instagram, TikTok, RedNote">
      {PLATFORMS.map(({ id, label, Icon, imageSrc, className }) => (
        <span key={id} className={`explore-social-icon ${className}`} title={label}>
          {imageSrc ? (
            <img src={imageSrc} alt="" width={22} height={22} className="explore-social-logo" />
          ) : (
            <Icon />
          )}
        </span>
      ))}
    </div>
  )
}
