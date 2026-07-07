import { Link } from 'react-router-dom'

function TripMeta({ items }) {
  if (!items?.length) return null
  return (
    <div className="trip-meta">
      {items.map((item, i) => (
        <span key={item.text} style={{ display: 'contents' }}>
          {i > 0 && <span className="dot" />}
          {item.icon ? (
            <>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.text}</span>
            </>
          ) : (
            <span>{item.text}</span>
          )}
        </span>
      ))}
    </div>
  )
}

export default function TripSummaryCard({
  featured = false,
  badge = 'upcoming',
  badgeLabel = 'Planned',
  dates,
  name,
  meta,
  to,
  className = '',
}) {
  const metaItems = Array.isArray(meta)
    ? meta
    : meta
      ? [{ text: meta }]
      : []

  const cardClass = `trip-card${featured ? ' featured' : ''}${className ? ` ${className}` : ''}`

  const content = (
    <div className="trip-content">
      <div className="trip-top">
        <span className={`trip-badge ${badge}`}>
          {badge === 'live' && (
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
              radio_button_checked
            </span>
          )}
          {badgeLabel}
        </span>
      </div>
      <div>
        {dates && <p className="trip-dates">{dates}</p>}
        <h3 className="trip-name">{name}</h3>
        <TripMeta items={metaItems} />
      </div>
    </div>
  )

  if (to) {
    return (
      <Link to={to} className={cardClass}>
        {content}
      </Link>
    )
  }

  return <div className={cardClass}>{content}</div>
}
