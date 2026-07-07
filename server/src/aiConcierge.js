// AI Concierge — turns a natural-language trip description (any language) into
// structured planning parameters using Google Gemini. The structured output is
// then fed into the existing itinerary engine, so recommendations stay grounded
// in real Travelah data rather than anything the model invents.

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'

export function isConciergeConfigured() {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim())
}

// Vibe ids understood by generateItinerary.js (VIBE_CATEGORIES).
const VIBE_IDS = ['culture', 'food', 'nature', 'adventure', 'relax', 'shopping']

// Grounding hint so the model only proposes destinations Travelah actually
// covers. Server-side validation (validateDestinationQuery) is still the source
// of truth — this just keeps the model's guesses inside Malaysia.
const KNOWN_DESTINATIONS = [
  'Kuala Lumpur', 'Penang', 'Langkawi', 'Malacca (Melaka)', 'Johor Bahru',
  'Ipoh', 'Cameron Highlands', 'Kuching', 'Kota Kinabalu', 'Sabah', 'Sarawak',
  'Genting Highlands', 'Pahang', 'Perak', 'Kedah', 'Terengganu', 'Kelantan',
  'Negeri Sembilan', 'Perlis', 'Putrajaya',
]

const TRIP_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    language: { type: 'string' },
    wantsItinerary: { type: 'boolean' },
    destinations: { type: 'array', items: { type: 'string' } },
    days: { type: 'integer' },
    vibes: { type: 'array', items: { type: 'string', enum: VIBE_IDS } },
    pace: { type: 'string', enum: ['relaxed', 'balanced', 'full'] },
    budget: { type: 'string', enum: ['shoestring', 'mid', 'splurge'] },
    notes: { type: 'string' },
    readyToPlan: { type: 'boolean' },
  },
  required: ['reply', 'wantsItinerary', 'readyToPlan'],
}

const SYSTEM_PROMPT = `You are Travelah's AI travel concierge for trips within MALAYSIA only.
You draw on thousands of real local social posts (TikTok / RedNote).

LANGUAGE: Understand the user in WHATEVER language they write (Malay, Mandarin, English, or mixed) and ALWAYS reply in that same language.

FIRST, classify the request — set "wantsItinerary":
- true ONLY when the user clearly wants a full day-by-day itinerary BUILT — e.g. "plan a trip", "create/build an itinerary", "5 days in Penang", "organise my trip", or when they say yes to your offer to build one.
- false for everything else: suggestions, recommendations, "top places", "best food", "what/where to go", "tell me about X", or general questions.

REPLY RULES:
- If "wantsItinerary" is FALSE (they want suggestions/info): answer DIRECTLY with a short NUMBERED list (3-6 items) of relevant, real Malaysian places/things, each with a brief one-line reason. End by asking if they'd like you to build a day-by-day itinerary from these. NEVER claim an itinerary was created.
- If "wantsItinerary" is TRUE: briefly confirm what you understood (1-2 sentences) and tell them their itinerary is ready below. Do NOT write out the full itinerary in the reply — the system builds it from real data.
- Keep replies warm, concise, and human.
- Write in PLAIN TEXT only — no markdown formatting (no **bold**, no # headings). Plain numbered lists like "1. Place — reason" are fine.

PLANNING FIELDS (the system uses these only when building an itinerary):
- "readyToPlan": true once you know at least one Malaysian destination. If a destination is missing or unclear, set it false and ask ONE short friendly follow-up.
- "destinations": Malaysian places/cities/states only, in English. Prefer these known names when they match: ${KNOWN_DESTINATIONS.join(', ')}.
- "days": total number of days as an integer if implied, else omit.
- "vibes": zero or more of ${VIBE_IDS.join(', ')} (e.g. "street food" -> food, "temples/heritage" -> culture, "hiking/waterfalls" -> nature, "diving/climbing" -> adventure, "beaches/slow" -> relax, "night markets/shopping" -> shopping).
- "pace": relaxed | balanced | full. "budget": shoestring | mid | splurge. Infer from cues; default to balanced/mid only when building an itinerary and unspecified.
- "notes": constraints worth carrying into planning (e.g. "halal only", "with elderly parents", "not a resort person"), in English.
- If the user asks for somewhere outside Malaysia, gently say Travelah currently focuses on Malaysia and suggest a Malaysian alternative.`

function buildContents(history, message) {
  const contents = []
  for (const turn of history || []) {
    const role = turn.role === 'model' || turn.role === 'ai' ? 'model' : 'user'
    const text = String(turn.text || '').trim()
    if (text) contents.push({ role, parts: [{ text }] })
  }
  contents.push({ role: 'user', parts: [{ text: String(message || '').trim() }] })
  return contents
}

async function callGemini(history, message) {
  const apiKey = process.env.GEMINI_API_KEY.trim()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent?key=${apiKey}`

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: buildContents(history, message),
    generationConfig: {
      temperature: 0.6,
      responseMimeType: 'application/json',
      responseSchema: TRIP_SCHEMA,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const err = new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`)
    err.status = res.status // e.g. 429 when the free-tier quota is exhausted
    throw err
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    const blocked = data?.promptFeedback?.blockReason
    throw new Error(blocked ? `Gemini blocked: ${blocked}` : 'Gemini returned no content')
  }
  return text
}

function coerceIntent(raw) {
  const out = {
    reply: typeof raw.reply === 'string' ? raw.reply : '',
    language: typeof raw.language === 'string' ? raw.language : null,
    destinations: Array.isArray(raw.destinations)
      ? raw.destinations.map((d) => String(d || '').trim()).filter(Boolean)
      : [],
    days: Number.isFinite(raw.days) && raw.days > 0 ? Math.min(Math.round(raw.days), 21) : null,
    vibes: Array.isArray(raw.vibes) ? raw.vibes.filter((v) => VIBE_IDS.includes(v)) : [],
    pace: ['relaxed', 'balanced', 'full'].includes(raw.pace) ? raw.pace : 'balanced',
    budget: ['shoestring', 'mid', 'splurge'].includes(raw.budget) ? raw.budget : 'mid',
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    wantsItinerary: Boolean(raw.wantsItinerary),
    readyToPlan: Boolean(raw.readyToPlan) && Array.isArray(raw.destinations) && raw.destinations.length > 0,
  }
  return out
}

// Returns a normalized intent object. Throws if the Gemini call itself fails.
export async function extractTripIntent(message, history = []) {
  const text = await callGemini(history, message)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    // Model didn't return clean JSON — treat the text as a plain reply.
    return coerceIntent({ reply: text, readyToPlan: false })
  }
  return coerceIntent(parsed)
}
