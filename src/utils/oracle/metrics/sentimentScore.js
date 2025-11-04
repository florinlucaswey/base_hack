import { clamp, fetchNewsArticles } from '../shared.js'

const POSITIVE_WORDS = new Set([
  'growth',
  'expansion',
  'profit',
  'funding',
  'hiring',
  'record',
  'award',
  'milestone',
  'launch',
  'wins',
  'success',
  'innovation',
  'leadership',
  'partnership',
  'breakthrough',
  'accolade',
  'acceleration',
  'approved',
  'achievement',
  'expands',
  'milestone',
  'optimistic',
  'positive',
  'gain',
  'beat',
])

const NEGATIVE_WORDS = new Set([
  'decline',
  'loss',
  'lawsuit',
  'delay',
  'ban',
  'investigation',
  'negative',
  'controversy',
  'critical',
  'problem',
  'challenge',
  'downturn',
  'drop',
  'risk',
  'regulatory',
  'cautious',
])

const computeSentimentScore = (text) => {
  if (!text) return 0
  const tokens = text.toLowerCase().match(/[a-z']+/g)
  if (!tokens || tokens.length === 0) return 0
  let score = 0
  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) score += 1
    else if (NEGATIVE_WORDS.has(token)) score -= 1
  }
  const normalized = score / Math.max(tokens.length / 12, 1)
  return clamp(normalized, -1, 1)
}

export const fetchSentimentScore = async (config) => {
  const articles = await fetchNewsArticles(config.sentimentQuery ?? config.mauQuery ?? '', 25)
  if (!articles.length) return undefined
  let total = 0
  let weight = 0
  for (const article of articles) {
    const text = `${article?.title ?? ''}. ${article?.description ?? ''}. ${article?.content ?? ''}`
    const score = computeSentimentScore(text)
    if (score === 0) continue
    const articleWeight = article?.source?.name?.toLowerCase().includes('press release') ? 0.75 : 1
    total += score * articleWeight
    weight += articleWeight
  }
  if (weight === 0) return 0
  return clamp(total / weight, -1, 1)
}
