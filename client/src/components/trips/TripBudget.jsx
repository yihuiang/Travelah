import { useEffect, useMemo, useRef, useState } from 'react'
import { getAuthToken, useAuth } from '../../context/AuthContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { updateTripBudget, updateTripBudgetCurrency, fetchFxRates } from '../../utils/tripsApi.js'
import '../../styles/trip-budget.css'

export const BUDGET_CATEGORIES = [
  { id: 'food', label: 'Food', icon: 'restaurant' },
  { id: 'shopping', label: 'Shopping', icon: 'shopping_bag' },
  { id: 'transport', label: 'Transport', icon: 'directions_bus' },
  { id: 'stay', label: 'Stay', icon: 'hotel' },
  { id: 'activities', label: 'Activities', icon: 'confirmation_number' },
  { id: 'other', label: 'Other', icon: 'category' },
]

const CATEGORY_MAP = Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.id, c]))

export const BUDGET_CURRENCIES = [
  { code: 'MYR', symbol: 'RM' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'USD', symbol: '$' },
  { code: 'THB', symbol: '฿' },
  { code: 'IDR', symbol: 'Rp' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CNY', symbol: 'CN¥' },
  { code: 'AUD', symbol: 'A$' },
]

const CURRENCY_MAP = Object.fromEntries(BUDGET_CURRENCIES.map((c) => [c.code, c]))
const DEFAULT_CURRENCY = 'MYR'

function currencyOf(code) {
  return CURRENCY_MAP[code] || CURRENCY_MAP[DEFAULT_CURRENCY]
}

function formatAmount(value, code = DEFAULT_CURRENCY) {
  return `${currencyOf(code).symbol} ${Number(value || 0).toFixed(2)}`
}

// Convert an amount in `code` to MYR using rates expressed as (units per 1 MYR).
function toMyr(amount, code, rates) {
  const value = Number(amount) || 0
  if (code === 'MYR') return value
  const rate = rates?.[code]
  if (!Number.isFinite(rate) || rate <= 0) return null
  return Math.round((value / rate) * 100) / 100
}

// Convert an amount given in MYR into `code` (units per 1 MYR).
function fromMyr(amountMyr, code, rates) {
  const value = Number(amountMyr) || 0
  if (code === 'MYR') return value
  const rate = rates?.[code]
  if (!Number.isFinite(rate) || rate <= 0) return null
  return Math.round(value * rate * 100) / 100
}

export default function TripBudget({ tripId, initialItems = [], initialDisplayCurrency = null }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const profileCurrency = CURRENCY_MAP[user?.settings?.currency] ? user.settings.currency : null
  const startingCurrency = initialDisplayCurrency || profileCurrency || DEFAULT_CURRENCY

  const [items, setItems] = useState(() => (Array.isArray(initialItems) ? initialItems : []))
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('food')
  const [displayCurrency, setDisplayCurrency] = useState(startingCurrency)
  const [currency, setCurrency] = useState(startingCurrency)
  const [fxRates, setFxRates] = useState(null)
  const labelInputRef = useRef(null)

  useEffect(() => {
    let active = true
    fetchFxRates().then((rates) => {
      if (active && rates) setFxRates(rates)
    })
    return () => {
      active = false
    }
  }, [])

  // Per-currency breakdown of what was actually spent (originals, no conversion).
  const totals = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const code = CURRENCY_MAP[item.currency] ? item.currency : DEFAULT_CURRENCY
      map.set(code, (map.get(code) || 0) + (Number(item.amount) || 0))
    }
    return [...map.entries()]
  }, [items])

  const multiCurrency = totals.length > 1

  // Grand total expressed in the chosen display currency. We sum each expense's
  // MYR snapshot first (stable), then convert that MYR sum into the display
  // currency. `approx` flags any conversion was involved (rates can drift).
  const displayTotal = useMemo(() => {
    // Exact path: everything already in the display currency — sum originals.
    if (totals.length === 1 && totals[0][0] === displayCurrency) {
      return { value: totals[0][1], code: displayCurrency, approx: false }
    }
    if (items.length === 0) {
      return { value: 0, code: displayCurrency, approx: false }
    }

    let myr = 0
    for (const item of items) {
      const code = CURRENCY_MAP[item.currency] ? item.currency : DEFAULT_CURRENCY
      let value = Number.isFinite(Number(item.amountMYR)) ? Number(item.amountMYR) : null
      if (value === null) value = toMyr(item.amount, code, fxRates)
      if (value !== null) myr += value
    }
    myr = Math.round(myr * 100) / 100

    if (displayCurrency === 'MYR') {
      return { value: myr, code: 'MYR', approx: true }
    }
    const converted = fromMyr(myr, displayCurrency, fxRates)
    if (converted === null) {
      // Rates not ready yet — fall back to showing MYR until they load.
      return { value: myr, code: 'MYR', approx: true }
    }
    return { value: converted, code: displayCurrency, approx: true }
  }, [items, totals, displayCurrency, fxRates])

  const persist = (list) => {
    setItems(list)
    const token = getAuthToken()
    if (token && tripId) {
      updateTripBudget(tripId, list, token).catch(() => {})
    }
  }

  const changeDisplayCurrency = (code) => {
    if (!CURRENCY_MAP[code] || code === displayCurrency) return
    setDisplayCurrency(code)
    const token = getAuthToken()
    if (token && tripId) {
      updateTripBudgetCurrency(tripId, code, token).catch(() => {})
    }
  }

  const removeItem = (id) => persist(items.filter((item) => item.id !== id))

  const resetForm = () => {
    setLabel('')
    setAmount('')
    setCategory('food')
  }

  const openAddForm = () => {
    setCurrency(displayCurrency)
    setAdding(true)
    requestAnimationFrame(() => labelInputRef.current?.focus())
  }

  const addExpense = (e) => {
    e.preventDefault()
    const value = Math.round(parseFloat(amount) * 100) / 100
    const name = label.trim()
    if (!Number.isFinite(value) || value <= 0) return
    const item = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: name,
      amount: value,
      category,
      currency,
      amountMYR: toMyr(value, currency, fxRates),
    }
    persist([...items, item])
    resetForm()
    requestAnimationFrame(() => labelInputRef.current?.focus())
  }

  return (
    <div className="budget-list">
      <div className="budget-total-row">
        <span className="budget-total-amount">
          {displayTotal.approx && <span className="budget-total-approx">≈ </span>}
          {formatAmount(displayTotal.value, displayTotal.code)}
        </span>
        <span className="budget-total-label">
          {items.length} {t(items.length === 1 ? 'expense' : 'expenses')}
        </span>
        <select
          className="budget-currency-select"
          value={displayCurrency}
          onChange={(e) => changeDisplayCurrency(e.target.value)}
          aria-label={t('Display currency')}
          title={t('Currency shown for the total')}
        >
          {BUDGET_CURRENCIES.map((cur) => (
            <option key={cur.code} value={cur.code}>
              {cur.symbol} {cur.code}
            </option>
          ))}
        </select>
      </div>

      {multiCurrency && (
        <p className="budget-breakdown">
          {totals.map(([code, sum], i) => (
            <span key={code} className="budget-breakdown-part">
              {i > 0 && <span className="budget-breakdown-sep">·</span>}
              {formatAmount(sum, code)}
            </span>
          ))}
        </p>
      )}

      {items.map((item) => {
        const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other
        return (
          <div key={item.id} className="budget-item">
            <span className={`budget-cat-icon cat-${cat.id}`}>
              <span className="material-symbols-outlined">{cat.icon}</span>
            </span>
            <div className="budget-item-info">
              <span className="budget-item-label">{item.label || t(cat.label)}</span>
              <span className="budget-item-cat">{t(cat.label)}</span>
            </div>
            <span className="budget-item-amount">{formatAmount(item.amount, item.currency)}</span>
            <button
              type="button"
              className="budget-remove"
              onClick={() => removeItem(item.id)}
              aria-label={t('Remove expense')}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        )
      })}

      {items.length === 0 && !adding && (
        <p className="budget-empty">{t('No expenses yet — add what you spend.')}</p>
      )}

      {adding ? (
        <form className="budget-add-form" onSubmit={addExpense}>
          <div className="budget-cat-chips">
            {BUDGET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`budget-cat-chip${category === cat.id ? ' active' : ''}`}
                onClick={() => setCategory(cat.id)}
              >
                <span className="material-symbols-outlined">{cat.icon}</span>
                {t(cat.label)}
              </button>
            ))}
          </div>
          <div className="budget-add-row">
            <input
              ref={labelInputRef}
              className="budget-add-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('What did you spend on?')}
              maxLength={120}
              aria-label={t('Expense description')}
            />
            <div className="budget-add-amount-wrap">
              <select
                className="budget-add-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label={t('Expense currency')}
              >
                {BUDGET_CURRENCIES.map((cur) => (
                  <option key={cur.code} value={cur.code}>
                    {cur.symbol} {cur.code}
                  </option>
                ))}
              </select>
              <input
                className="budget-add-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-label={t('Amount')}
              />
            </div>
          </div>
          <div className="budget-add-actions">
            <button
              type="button"
              className="budget-cancel"
              onClick={() => {
                resetForm()
                setAdding(false)
              }}
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              className="budget-save"
              disabled={!(parseFloat(amount) > 0)}
            >
              {t('Add expense')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="budget-add" onClick={openAddForm}>
          <span className="material-symbols-outlined">add</span> {t('Add expense')}
        </button>
      )}
    </div>
  )
}
