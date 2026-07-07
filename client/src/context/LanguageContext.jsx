import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { UI_STRINGS } from '../i18n/ui.js'
import { lookupUiString, STRING_LOCALES, translateUiString } from '../i18n/ui-locales.js'
import { lookupPlaceName } from '../i18n/place-names.js'
import { lookupStateName } from '../i18n/state-names.js'
import {
  shouldTranslateDescription,
  shouldTranslatePlaceName,
  shouldTranslateCategory,
  formatCategoryLabel,
  isCanonicalCategory,
  normalizeForTranslation,
  isGenuineTranslation,
} from '../utils/localizeContent.js'

const STORAGE_KEY = 'travelah-lang'
const CACHE_PREFIX = 'travelah-tr:'
const DYNAMIC_CACHE_PREFIX = 'travelah-tr-dyn:'

export const LANGUAGES = {
  en: { code: 'en', label: 'EN', name: 'English' },
  ms: { code: 'ms', label: 'MS', name: 'Melayu' },
  'zh-CN': { code: 'zh-CN', label: '中文', name: 'Mandarin 中文' },
}

export function settingsLanguageToCode(settingsLang) {
  if (!settingsLang) return 'en'
  if (settingsLang === 'en-GB' || settingsLang === 'en-US' || settingsLang === 'en') return 'en'
  return LANGUAGES[settingsLang] ? settingsLang : 'en'
}

export function codeToSettingsLanguage(code) {
  if (code === 'en') return 'en-GB'
  return code
}

const LanguageContext = createContext(null)

function loadLangCache(lang) {
  if (lang === 'en') return {}
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + lang)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadDynamicCache(lang) {
  try {
    const raw = localStorage.getItem(DYNAMIC_CACHE_PREFIX + lang)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const UI_STRING_VALUES = Object.values(UI_STRINGS).filter((v) => typeof v === 'string')

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES[saved] ? saved : 'en'
  })

  const cacheRef = useRef({})
  const dynamicCacheRef = useRef({})
  const knownStringsRef = useRef(new Set(UI_STRING_VALUES))
  const pendingRef = useRef(new Set())
  const dynamicPendingRef = useRef(new Set())
  const flushTimerRef = useRef(null)
  const dynamicFlushTimerRef = useRef(null)
  const [version, setVersion] = useState(0)

  const ensureLangCache = useCallback((lang) => {
    if (lang === 'en') return null
    if (!cacheRef.current[lang]) cacheRef.current[lang] = loadLangCache(lang)
    return cacheRef.current[lang]
  }, [])

  const ensureDynamicCache = useCallback((lang) => {
    if (!dynamicCacheRef.current[lang]) {
      dynamicCacheRef.current[lang] = loadDynamicCache(lang)
    }
    return dynamicCacheRef.current[lang]
  }, [])

  const persist = useCallback((lang) => {
    if (lang === 'en') return
    try {
      localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(cacheRef.current[lang] || {}))
    } catch {
      // ignore
    }
  }, [])

  const persistDynamic = useCallback((lang) => {
    try {
      localStorage.setItem(
        DYNAMIC_CACHE_PREFIX + lang,
        JSON.stringify(dynamicCacheRef.current[lang] || {}),
      )
    } catch {
      // ignore
    }
  }, [])

  const sendBatch = useCallback(
    (texts, targetLang) => {
      const langCache = ensureLangCache(targetLang) || {}
      const uncached = texts.filter(
        (t) => t && !isGenuineTranslation(t, langCache[t], targetLang),
      )
      if (!uncached.length) return

      fetch('/api/translate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: uncached, to: targetLang, from: 'en' }),
      })
        .then((res) => res.json())
        .then((data) => {
          const translations = Array.isArray(data.translations) ? data.translations : []
          uncached.forEach((text, i) => {
            if (isGenuineTranslation(text, translations[i], targetLang)) langCache[text] = translations[i]
          })
          cacheRef.current[targetLang] = langCache
          persist(targetLang)
          setVersion((n) => n + 1)
        })
        .catch(() => {})
    },
    [ensureLangCache, persist],
  )

  const sendDynamicBatch = useCallback(
    (texts, targetLang) => {
      const langCache = ensureDynamicCache(targetLang)
      const uncached = texts.filter(
        (t) => t && !isGenuineTranslation(t, langCache[t], targetLang),
      )
      if (!uncached.length) return

      fetch('/api/translate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: uncached, to: targetLang, from: 'auto' }),
      })
        .then((res) => res.json())
        .then((data) => {
          const translations = Array.isArray(data.translations) ? data.translations : []
          uncached.forEach((text, i) => {
            if (isGenuineTranslation(text, translations[i], targetLang)) langCache[text] = translations[i]
          })
          dynamicCacheRef.current[targetLang] = langCache
          persistDynamic(targetLang)
          setVersion((n) => n + 1)
        })
        .catch(() => {})
    },
    [ensureDynamicCache, persistDynamic],
  )

  const flushPending = useCallback(() => {
    const texts = Array.from(pendingRef.current)
    pendingRef.current = new Set()
    const targetLang = language
    if (!texts.length || targetLang === 'en') return
    sendBatch(texts, targetLang)
  }, [language, sendBatch])

  const flushDynamicPending = useCallback(() => {
    const texts = Array.from(dynamicPendingRef.current)
    dynamicPendingRef.current = new Set()
    if (!texts.length) return
    sendDynamicBatch(texts, language)
  }, [language, sendDynamicBatch])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushPending, 20)
  }, [flushPending])

  const scheduleDynamicFlush = useCallback(() => {
    if (dynamicFlushTimerRef.current) clearTimeout(dynamicFlushTimerRef.current)
    dynamicFlushTimerRef.current = setTimeout(flushDynamicPending, 20)
  }, [flushDynamicPending])

  const queueDynamicTranslations = useCallback(
    (texts) => {
      const langCache = ensureDynamicCache(language)
      for (const raw of texts) {
        if (!raw || typeof raw !== 'string') continue
        const text = normalizeForTranslation(raw)
        const cached = langCache[text] || langCache[raw]
        if (cached && isGenuineTranslation(text, cached, language)) continue
        dynamicPendingRef.current.add(text)
      }
      if (dynamicPendingRef.current.size) scheduleDynamicFlush()
    },
    [language, ensureDynamicCache, scheduleDynamicFlush],
  )

  const setLanguage = useCallback(
    (code) => {
      if (!LANGUAGES[code]) return
      ensureLangCache(code)
      ensureDynamicCache(code)
      pendingRef.current = new Set()
      dynamicPendingRef.current = new Set()
      setLanguageState(code)
      localStorage.setItem(STORAGE_KEY, code)

      if (code !== 'en') {
        const hardcoded = new Set(Object.keys(STRING_LOCALES[code] || {}))
        const allKnown = Array.from(knownStringsRef.current).filter((text) => !hardcoded.has(text))
        if (allKnown.length) sendBatch(allKnown, code)
      }
    },
    [ensureLangCache, ensureDynamicCache, sendBatch],
  )

  const readDynamic = useCallback(
    (text) => {
      if (!text || typeof text !== 'string') return text
      return ensureDynamicCache(language)[text] || text
    },
    [language, ensureDynamicCache, version],
  )

  const tPlaceName = useCallback(
    (name) => {
      if (!name || typeof name !== 'string') return name

      const hardcoded = lookupPlaceName(name, language)
      if (hardcoded != null) return hardcoded

      if (!shouldTranslatePlaceName(name, language)) return name
      const cached = ensureDynamicCache(language)[name]
      if (cached && isGenuineTranslation(name, cached, language)) return cached
      dynamicPendingRef.current.add(name)
      scheduleDynamicFlush()
      return name
    },
    [language, ensureDynamicCache, scheduleDynamicFlush, version],
  )

  const tContent = useCallback(
    (text) => {
      if (!text || typeof text !== 'string') return text
      if (!shouldTranslateDescription(text, language)) return text
      const source = normalizeForTranslation(text)
      const cached = ensureDynamicCache(language)[source] || ensureDynamicCache(language)[text]
      if (cached && isGenuineTranslation(source, cached, language)) return cached
      dynamicPendingRef.current.add(source)
      scheduleDynamicFlush()
      return source
    },
    [language, ensureDynamicCache, scheduleDynamicFlush, version],
  )

  const t = useCallback(
    (text) => {
      if (!text || typeof text !== 'string') return text

      const hardcoded = translateUiString(text, language)
      if (hardcoded != null) return hardcoded
      if (language === 'en') return text

      knownStringsRef.current.add(text)
      const langCache = ensureLangCache(language) || {}
      const cached = langCache[text]
      if (cached && isGenuineTranslation(text, cached, language)) return cached

      if (!pendingRef.current.has(text)) {
        pendingRef.current.add(text)
        scheduleFlush()
      }
      return text
    },
    [language, ensureLangCache, scheduleFlush],
  )

  const tCategory = useCallback(
    (category) => {
      if (!category || typeof category !== 'string') return category
      const label = formatCategoryLabel(category)
      if (isCanonicalCategory(category)) return t(label)
      if (!shouldTranslateCategory(category, language)) return label
      const cached = ensureDynamicCache(language)[category]
      if (cached && isGenuineTranslation(category, cached, language)) return cached
      dynamicPendingRef.current.add(category)
      scheduleDynamicFlush()
      return label
    },
    [language, t, ensureDynamicCache, scheduleDynamicFlush, version],
  )

  const tState = useCallback(
    (state) => lookupStateName(state, language),
    [language],
  )

  const ui = useMemo(() => {
    if (language === 'en') return UI_STRINGS
    return new Proxy(UI_STRINGS, {
      get(target, prop) {
        const value = target[prop]
        if (typeof value !== 'string') return value
        return lookupUiString(prop, value, language) ?? value
      },
    })
  }, [language])

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      ui,
      t,
      tPlaceName,
      tContent,
      tCategory,
      tState,
      queueDynamicTranslations,
      languageLabel: LANGUAGES[language]?.label ?? 'EN',
    }),
    [language, setLanguage, ui, t, tPlaceName, tContent, tCategory, tState, queueDynamicTranslations, version],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
