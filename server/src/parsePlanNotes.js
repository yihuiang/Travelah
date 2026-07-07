/** Parse free-text plan notes (BM / 中文 / EN) into scoring hints for the itinerary engine. */

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'

const VIBE_IDS = ['culture', 'food', 'nature', 'adventure', 'relax', 'shopping']

const NOTES_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    preferKeywords: { type: 'array', items: { type: 'string' } },
    avoidKeywords: { type: 'array', items: { type: 'string' } },
    bonusVibes: { type: 'array', items: { type: 'string', enum: VIBE_IDS } },
  },
  required: ['summary', 'preferKeywords', 'avoidKeywords', 'bonusVibes'],
}

const SYSTEM_PROMPT = `You extract travel constraints from a user's free-text note for a Malaysia trip planner.
Input may be Malay, Mandarin, English, or mixed. Output JSON only.

Rules:
- "summary": one short English sentence describing what they want (for display).
- "preferKeywords": lowercase English phrases to BOOST matching places (name/description), e.g. "halal", "hawker", "accessible", "night market".
- "avoidKeywords": lowercase English phrases to PENALIZE or exclude, e.g. "non halal", "resort", "hiking", "crowded".
- "bonusVibes": zero or more of ${VIBE_IDS.join(', ')} implied by the note but not already obvious.
- Be conservative: only add keywords you are confident about.
- Halal / Muslim food requests: prefer "halal", "muslim-friendly"; avoid "non halal", "pork", "beer".
- Elderly / wheelchair / kids: prefer "accessible", "flat", "easy walk"; avoid "hiking", "climb", "steep".
- Not a resort person: avoid "resort", "luxury hotel".
- Keep each keyword 1–4 words. Max 8 prefer and 8 avoid keywords.`

export const EMPTY_PLAN_NOTES = {
  summary: '',
  preferKeywords: [],
  avoidKeywords: [],
  bonusVibes: [],
}

function normalizeList(values, max = 8) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  const out = []
  for (const item of values) {
    const text = String(item || '').trim().toLowerCase()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function coerceParsed(raw) {
  return {
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    preferKeywords: normalizeList(raw.preferKeywords),
    avoidKeywords: normalizeList(raw.avoidKeywords),
    bonusVibes: Array.isArray(raw.bonusVibes)
      ? raw.bonusVibes.filter((v) => VIBE_IDS.includes(v))
      : [],
  }
}

/** Rule-based parser when Gemini is unavailable or rate-limited. */
export function fallbackParsePlanNotes(text) {
  const raw = String(text || '').trim()
  if (!raw) return { ...EMPTY_PLAN_NOTES }

  const lower = raw.toLowerCase()
  const preferKeywords = []
  const avoidKeywords = []
  const bonusVibes = []

  const wantsHalal = /halal|清真|穆斯林|muslim[- ]?friendly/i.test(raw)
  const rejectsResort = /(not|bukan|不要|别|no)\s+(a\s+)?resort|bukan.*resort|不是.*度假|不要.*度假/i.test(raw)
  const elderly = /elderly|老人|长辈|ibu bapa tua|parents|wheelchair|stroller|小孩|孩子/i.test(raw)

  if (wantsHalal) {
    preferKeywords.push('halal', 'muslim-friendly', 'muslim friendly', 'jakim')
    avoidKeywords.push('non halal', 'non-halal', 'pork', 'beer', '啤酒')
    if (!bonusVibes.includes('food')) bonusVibes.push('food')
  }

  if (rejectsResort) {
    avoidKeywords.push('resort', 'luxury hotel', 'spa resort')
  }

  if (elderly) {
    preferKeywords.push('accessible', 'museum', 'garden', 'flat')
    avoidKeywords.push('hiking', 'climb', 'steep', 'trek')
    if (!bonusVibes.includes('culture')) bonusVibes.push('culture')
  }

  if (/hawker|小贩|夜市|night market|pasar malam/i.test(raw)) {
    preferKeywords.push('hawker', 'night market', 'pasar malam')
    if (!bonusVibes.includes('food')) bonusVibes.push('food')
  }

  if (/beach|pantai|海滩|沙滩/i.test(raw) && !/avoid|bukan|不要/i.test(raw)) {
    preferKeywords.push('beach', 'pantai')
    if (!bonusVibes.includes('relax')) bonusVibes.push('relax')
  }

  return coerceParsed({
    summary: raw,
    preferKeywords,
    avoidKeywords,
    bonusVibes,
  })
}

async function callGeminiForNotes(notes, context) {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null

  const userPrompt = `Trip context: destinations=${(context.destinations || []).join(', ') || 'unknown'}; vibes=${(context.vibes || []).join(', ') || 'none'}; pace=${context.pace || 'balanced'}; budget=${context.budget || 'mid'}.

User note:
${notes}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: NOTES_SCHEMA,
      },
    }),
  })

  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`)
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null
  return coerceParsed(JSON.parse(text))
}

/**
 * @returns {{ parsed: typeof EMPTY_PLAN_NOTES, usedAi: boolean, rateLimited: boolean }}
 */
export async function parsePlanNotes(rawNotes, context = {}) {
  const notes = String(rawNotes || '').trim()
  if (!notes) {
    return { parsed: { ...EMPTY_PLAN_NOTES }, usedAi: false, rateLimited: false }
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return { parsed: fallbackParsePlanNotes(notes), usedAi: false, rateLimited: false }
  }

  try {
    const parsed = await callGeminiForNotes(notes, context)
    if (parsed) {
      return { parsed, usedAi: true, rateLimited: false }
    }
  } catch (err) {
    if (err.status === 429) {
      return { parsed: fallbackParsePlanNotes(notes), usedAi: false, rateLimited: true }
    }
  }

  return { parsed: fallbackParsePlanNotes(notes), usedAi: false, rateLimited: false }
}
