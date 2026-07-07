import { translate } from '@vitalets/google-translate-api'
import { translate as translateX } from 'google-translate-api-x'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_PATH = path.resolve(__dirname, '../data/ui-translations.json')

const cache = new Map()
const queue = []
let processing = false
let cacheDirty = false
const DELAY_MS = 80

function loadCacheFromDisk() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw)) cache.set(key, value)
    }
  } catch {
    // no cache yet
  }
}

export function saveCacheToDisk() {
  if (!cacheDirty) return
  try {
    const dir = path.dirname(CACHE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const obj = Object.fromEntries(cache.entries())
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(obj, null, 0)}\n`, 'utf8')
    cacheDirty = false
  } catch {
    // ignore persistence errors
  }
}

loadCacheFromDisk()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Single-request translation with backoff on Google's "Too Many Requests".
async function translateOnce(text, to, from, attempt = 0) {
  try {
    const { text: out } = await translate(text, { from, to })
    return out
  } catch (error) {
    if (/too many requests|429/i.test(error.message || '') && attempt < 3) {
      await sleep(2000 * (attempt + 1))
      return translateOnce(text, to, from, attempt + 1)
    }
    throw error
  }
}

async function processQueue() {
  if (processing) return
  processing = true
  while (queue.length > 0) {
    const { text, to, from, resolve } = queue.shift()
    const cacheKey = `${from}|${to}|${text}`
    try {
      if (cache.has(cacheKey)) {
        resolve(cache.get(cacheKey))
      } else {
        const translated = await translateOnce(text, to, from)
        cache.set(cacheKey, translated)
        cacheDirty = true
        resolve(translated)
        await sleep(DELAY_MS)
      }
    } catch (error) {
      console.error('Translation failed:', error.message)
      resolve(text)
    }
  }
  processing = false
}

export function translateText(text, to, from = 'auto') {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return Promise.resolve(text)
  if (from !== 'auto' && from === to) return Promise.resolve(text)

  const cacheKey = `${from}|${to}|${trimmed}`
  if (cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey))

  return new Promise((resolve, reject) => {
    queue.push({ text: trimmed, to, from, resolve, reject })
    processQueue()
  })
}

export async function translateFields(item, fields, to, from = 'zh-CN') {
  if (to === from) return item

  const result = { ...item }
  for (const field of fields) {
    if (item[field]) {
      result[field] = await translateText(item[field], to, from)
    }
  }
  return result
}

const CHUNK_SIZE = 100

// Translate an array of strings in a SINGLE Google request via the batch
// endpoint (google-translate-api-x), with backoff on rate limiting.
async function translateArrayOnce(texts, to, from, attempt = 0) {
  try {
    const out = await translateX(texts, { from, to, forceBatch: true })
    // google-translate-api-x returns an array of { text } in array mode.
    if (Array.isArray(out)) return out.map((item) => item?.text ?? '')
    return [out?.text ?? '']
  } catch (error) {
    if (/too many requests|429/i.test(error.message || '') && attempt < 3) {
      await sleep(2000 * (attempt + 1))
      return translateArrayOnce(texts, to, from, attempt + 1)
    }
    throw error
  }
}

// Translate many strings using as few Google requests as possible: uncached
// strings are sent to Google's batch endpoint in one request per chunk,
// instead of one HTTP request per string (which gets rate-limited).
export async function translateBatch(texts, to, from = 'en') {
  const result = new Array(texts.length)
  const uncachedIdx = []
  const uncachedTexts = []

  texts.forEach((text, i) => {
    const raw = String(text ?? '')
    if (!raw.trim() || from === to) {
      result[i] = text
      return
    }
    const key = `${from}|${to}|${raw}`
    if (cache.has(key)) {
      result[i] = cache.get(key)
      return
    }
    uncachedIdx.push(i)
    uncachedTexts.push(raw)
  })

  if (uncachedTexts.length === 0) return result

  for (let start = 0; start < uncachedTexts.length; start += CHUNK_SIZE) {
    const chunkTexts = uncachedTexts.slice(start, start + CHUNK_SIZE)
    const chunkIdx = uncachedIdx.slice(start, start + CHUNK_SIZE)

    try {
      const parts = await translateArrayOnce(chunkTexts, to, from)
      chunkTexts.forEach((orig, j) => {
        const val = parts[j] || orig
        cache.set(`${from}|${to}|${orig}`, val)
        cacheDirty = true
        result[chunkIdx[j]] = val
      })
    } catch (error) {
      console.error('Batch translation failed:', error.message)
      chunkTexts.forEach((orig, j) => {
        result[chunkIdx[j]] = orig
      })
    }

    await sleep(DELAY_MS)
  }

  return result
}
