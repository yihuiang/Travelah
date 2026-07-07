import { conversationsCollection } from './db.js'

// Multiple saved conversations per user. Each document is one conversation:
// { _id: conversationId, userId, title, messages: [...], createdAt, updatedAt }
const MAX_MESSAGES = 100

function newConversationId() {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function titleFromText(text) {
  const clean = String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!clean) return 'New chat'
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean
}

export async function createConversation(userId, userMessage, aiMessage) {
  const now = new Date()
  const doc = {
    _id: newConversationId(),
    userId,
    title: titleFromText(userMessage.text),
    messages: [userMessage, aiMessage].slice(-MAX_MESSAGES),
    createdAt: now,
    updatedAt: now,
  }
  await conversationsCollection().insertOne(doc)
  return doc._id
}

// Returns true if the conversation existed (and was owned) and was updated.
export async function appendToConversation(conversationId, userId, userMessage, aiMessage) {
  const result = await conversationsCollection().updateOne(
    { _id: conversationId, userId },
    {
      $push: { messages: { $each: [userMessage, aiMessage], $slice: -MAX_MESSAGES } },
      $set: { updatedAt: new Date() },
    },
  )
  return result.matchedCount > 0
}

export async function getConversationMessages(conversationId, userId) {
  const doc = await conversationsCollection().findOne({ _id: conversationId, userId })
  return doc ? doc.messages || [] : null
}

export async function listConversations(userId) {
  const docs = await conversationsCollection()
    .find({ userId })
    .project({ title: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray()
  return docs.map((d) => ({
    id: d._id,
    title: d.title || 'New chat',
    updatedAt: d.updatedAt || d.createdAt || null,
  }))
}

export async function deleteConversation(conversationId, userId) {
  await conversationsCollection().deleteOne({ _id: conversationId, userId })
}

export async function deleteAllConversationsForUser(userId) {
  const result = await conversationsCollection().deleteMany({ userId })
  return result.deletedCount
}
