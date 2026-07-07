import { useMemo, useRef, useState } from 'react'
import { getAuthToken } from '../../context/AuthContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { updateTripPacking } from '../../utils/tripsApi.js'
import '../../styles/packing-list.css'

export default function PackingList({ tripId, initialItems = [] }) {
  const { t } = useLanguage()
  const [items, setItems] = useState(() => (Array.isArray(initialItems) ? initialItems : []))
  const [newItem, setNewItem] = useState('')
  const [adding, setAdding] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const addInputRef = useRef(null)

  const doneCount = useMemo(() => items.filter((item) => item.checked).length, [items])
  const visibleItems = hideDone ? items.filter((item) => !item.checked) : items

  const persist = (list) => {
    setItems(list)
    const token = getAuthToken()
    if (token && tripId) {
      updateTripPacking(tripId, list, token).catch(() => {})
    }
  }

  const toggleItem = (id) =>
    persist(items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)))

  const removeItem = (id) => persist(items.filter((item) => item.id !== id))

  const addItem = (e) => {
    e.preventDefault()
    const label = newItem.trim()
    if (!label) return
    const item = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      checked: false,
    }
    persist([...items, item])
    setNewItem('')
  }

  return (
    <div className="packing-list">
      <div className="packing-head">
        <p className="packing-kicker">
          {doneCount} {t('of')} {items.length} {t('done')}
        </p>
        {doneCount > 0 && (
          <button type="button" className="packing-filter" onClick={() => setHideDone((v) => !v)}>
            <span className="material-symbols-outlined">
              {hideDone ? 'visibility' : 'visibility_off'}
            </span>
            {hideDone ? t('Show done') : t('Hide done')}
          </button>
        )}
      </div>

      {visibleItems.map((item) => (
        <div key={item.id} className={`packing-item${item.checked ? ' done' : ''}`}>
          <button type="button" className="packing-item-main" onClick={() => toggleItem(item.id)}>
            <span className="packing-box">
              {item.checked && (
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  check
                </span>
              )}
            </span>
            <span className="packing-label">{item.label}</span>
          </button>
          <button
            type="button"
            className="packing-remove"
            onClick={() => removeItem(item.id)}
            aria-label={t('Remove item')}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      ))}

      {items.length === 0 && (
        <p className="packing-empty">{t('No items yet — add what you need to pack.')}</p>
      )}

      {adding ? (
        <form className="packing-add-form" onSubmit={addItem}>
          <span className="packing-box" aria-hidden="true" />
          <input
            ref={addInputRef}
            className="packing-add-inline"
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onBlur={() => {
              if (!newItem.trim()) setAdding(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNewItem('')
                setAdding(false)
              }
            }}
            placeholder={t('Add an item…')}
            maxLength={120}
            aria-label={t('Add item')}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </form>
      ) : (
        <button
          type="button"
          className="packing-add"
          onClick={() => {
            setAdding(true)
            requestAnimationFrame(() => addInputRef.current?.focus())
          }}
        >
          <span className="material-symbols-outlined">add</span> {t('Add item')}
        </button>
      )}
    </div>
  )
}
