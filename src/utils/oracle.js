const STEP_INTERVAL_MS = 15 * 60 * 1000
const HISTORY_LENGTH = 60
const SCRAPE_CACHE_TTL = 12 * 60 * 60 * 1000

const COMPANY_METADATA = {
  openai: { id: 'openai', name: 'OpenAI', ticker: 'OPAI', category: 'AI Research' },
  spacex: { id: 'spacex', name: 'SpaceX', ticker: 'SPAC', category: 'Aerospace' },
  neuralink: { id: 'neuralink', name: 'Neuralink', ticker: 'NRLX', category: 'Neurotech' },
}

export const COMPANY_IDS = Object.keys(COMPANY_METADATA)

const PRICE_BANDS = {
  openai: { floor: 160, ceiling: 250 },
  spacex: { floor: 220, ceiling: 340 },
  neuralink: { floor: 70, ceiling: 150 },
}

const INTERNAL_SCHEMA = [
  { key: 'annualRevenue', weight: 0.42, bounds: { min: 0, max: 120 }, jitter: 1.2 },
  { key: 'sentimentScore', weight: 0.28, bounds: { min: -1, max: 1 }, jitter: 0.12 },
  { key: 'monthlyActiveUsers', weight: 0.3, bounds: { min: 0, max: 400 }, jitter: 6 },
]

const EXTERNAL_SCHEMA = [
  { key: 'marketPerformance', weight: 0.38, bounds: { min: -0.25, max: 0.25 }, jitter: 0.018 },
  { key: 'verticalPerformance', weight: 0.34, bounds: { min: -0.3, max: 0.3 }, jitter: 0.02 },
  { key: 'fearGreedIndex', weight: 0.28, bounds: { min: 0, max: 100 }, jitter: 3.5 },
]

const DEFAULT_BASELINES = {
  openai: {
    internal: {
      annualRevenue: 3.6, // USD billions, Crunchbase/PitchBook filings
      sentimentScore: 0.34, // -1 to 1, media/news sentiment
      monthlyActiveUsers: 95, // millions, company releases
    },
    external: {
      marketPerformance: 0.05, // S&P / global innovation index delta
      verticalPerformance: 0.08, // AI vertical performance delta
      fearGreedIndex: 62, // alternative asset fear & greed index
    },
  },
  spacex: {
    internal: {
      annualRevenue: 9.8,
      sentimentScore: 0.27,
      monthlyActiveUsers: 32,
    },
    external: {
      marketPerformance: 0.041,
      verticalPerformance: 0.052,
      fearGreedIndex: 58,
    },
  },
  neuralink: {
    internal: {
      annualRevenue: 0.24,
      sentimentScore: 0.15,
      monthlyActiveUsers: 1.5,
    },
    external: {
      marketPerformance: 0.033,
      verticalPerformance: 0.018,
      fearGreedIndex: 54,
    },
  },
}

const scrapedMetricsCache = new Map()

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const normalize = (value, { min, max }) => {
  const clamped = clamp(value, min, max)
  const range = max - min
  if (range === 0) return 0
  return (clamped - min) / range
}

const roundTo = (value, precision) => {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const round2 = (value) => roundTo(value, 2)
const round3 = (value) => roundTo(value, 3)

const SCRAPE_REFRESH_WINDOW_MS = 60 * 60 * 1000
const SCRAPE_FAILURE_BACKOFF_MS = 10 * 60 * 1000
const SCRAPE_REQUEST_TIMEOUT_MS = 10_000
const ALPHA_VANTAGE_CACHE_TTL = 15 * 60 * 1000

const resolveEnv = (key) => {
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key]
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] !== undefined) {
    return import.meta.env[key]
  }
  return undefined
}

const COMPANY_SOURCES = {
  openai: {
    crunchbaseId: 'openai',
    pitchbookId: 'openai',
    sentimentQuery: '"OpenAI" OR "ChatGPT"',
    mauQuery: '"OpenAI" OR "ChatGPT"',
    marketSymbol: 'SPY',
    verticalSymbol: 'QQQ',
  },
  spacex: {
    crunchbaseId: 'space-exploration-technologies',
    pitchbookId: 'space-exploration-technologies',
    sentimentQuery: '"SpaceX" OR "Starlink"',
    mauQuery: '"Starlink" OR "SpaceX"',
    marketSymbol: 'SPY',
    verticalSymbol: 'XAR',
  },
  neuralink: {
    crunchbaseId: 'neuralink',
    pitchbookId: 'neuralink',
    sentimentQuery: '"Neuralink"',
    mauQuery: '"Neuralink"',
    marketSymbol: 'SPY',
    verticalSymbol: 'XLV',
  },
}

const inFlightScrapes = new Map()
const lastScrapeAttempts = new Map()
const alphaVantageCache = new Map()

const fetchWithTimeout = async (input, init = {}, timeout = SCRAPE_REQUEST_TIMEOUT_MS) => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available for scraping.')
  }

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${input}`)
    }
    return response
  } finally {
    clearTimeout(id)
  }
}

const safeJson = async (input, init, timeout) => {
  try {
    const response = await fetchWithTimeout(input, init, timeout)
    return await response.json()
  } catch (error) {
    console.error('[oracle] JSON fetch failed:', error)
    return undefined
  }
}

const magnitudeRegex = /(\d[\d,\.]*)\s?(billion|million|thousand|bn|mm|m|k|b|mn)/i

const extractMagnitudeFromText = (text) => {
  if (typeof text !== 'string') return undefined
  const match = text.match(magnitudeRegex)
  if (!match) return undefined
  const rawValue = parseFloat(match[1].replace(/,/g, ''))
  if (!Number.isFinite(rawValue)) return undefined
  return {
    value: rawValue,
    unit: match[2]?.toLowerCase() ?? '',
  }
}

const convertToBillions = (value, unit) => {
  if (!Number.isFinite(value)) return undefined
  const normalized = unit.startsWith('b')
    ? 'b'
    : unit.startsWith('m') || unit === 'mm' || unit === 'mn'
    ? 'm'
    : unit.startsWith('k') || unit === 'thousand'
    ? 'k'
    : unit
  if (normalized === 'b') return value
  if (normalized === 'm') return value / 1000
  if (normalized === 'k') return value / 1_000_000
  return undefined
}

const convertToMillions = (value, unit) => {
  if (!Number.isFinite(value)) return undefined
  const normalized = unit.startsWith('b')
    ? 'b'
    : unit.startsWith('m') || unit === 'mm' || unit === 'mn'
    ? 'm'
    : unit.startsWith('k') || unit === 'thousand'
    ? 'k'
    : unit
  if (normalized === 'b') return value * 1000
  if (normalized === 'm') return value
  if (normalized === 'k') return value / 1000
  return undefined
}

const parseRevenueValue = (raw) => {
  if (raw == null) return undefined
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return undefined
    if (raw > 10_000) return raw / 1_000_000_000
    return raw
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return undefined
    if (trimmed.includes('-')) {
      const [low, high] = trimmed.split('-')
      const lowValue = parseRevenueValue(low)
      const highValue = parseRevenueValue(high)
      if (typeof lowValue === 'number' && typeof highValue === 'number') {
        return (lowValue + highValue) / 2
      }
    }
    const magnitude = extractMagnitudeFromText(trimmed)
    if (magnitude) {
      return convertToBillions(magnitude.value, magnitude.unit)
    }
    const numeric = parseFloat(trimmed.replace(/,/g, ''))
    if (Number.isFinite(numeric)) {
      return numeric > 10_000 ? numeric / 1_000_000_000 : numeric
    }
    return undefined
  }
  if (typeof raw === 'object') {
    if (raw.amount !== undefined) {
      return parseRevenueValue(raw.amount)
    }
    if (raw.value !== undefined) {
      return parseRevenueValue(raw.value)
    }
    if (raw.min !== undefined && raw.max !== undefined) {
      const minValue = parseRevenueValue(raw.min)
      const maxValue = parseRevenueValue(raw.max)
      if (typeof minValue === 'number' && typeof maxValue === 'number') {
        return (minValue + maxValue) / 2
      }
    }
  }
  return undefined
}

const crunchbaseKey =
  resolveEnv('VITE_CRUNCHBASE_API_KEY') ?? resolveEnv('CRUNCHBASE_API_KEY') ?? resolveEnv('CRUNCHBASE_TOKEN')
const pitchbookKey =
  resolveEnv('VITE_PITCHBOOK_API_KEY') ?? resolveEnv('PITCHBOOK_API_KEY') ?? resolveEnv('PITCHBOOK_TOKEN')
const newsApiKey = resolveEnv('VITE_NEWSAPI_KEY') ?? resolveEnv('NEWSAPI_KEY') ?? resolveEnv('NEWS_API_KEY')
const alphaVantageKey =
  resolveEnv('VITE_ALPHAVANTAGE_API_KEY') ?? resolveEnv('ALPHAVANTAGE_API_KEY') ?? resolveEnv('ALPHA_VANTAGE_KEY')

const fetchCrunchbaseRevenue = async (config) => {
  if (!crunchbaseKey || !config.crunchbaseId) return undefined
  const url = new URL(
    `https://api.crunchbase.com/api/v4/entities/organizations/${encodeURIComponent(config.crunchbaseId)}`
  )
  url.searchParams.set('user_key', crunchbaseKey)
  url.searchParams.set('field_ids', 'financials,revenue_range,annual_revenue')
  const json = await safeJson(url.toString())
  const annualRevenue =
    json?.data?.properties?.annual_revenue ?? json?.data?.properties?.revenue_range?.value ?? json?.data?.properties?.financials
  const parsed = parseRevenueValue(annualRevenue)
  return typeof parsed === 'number' ? parsed : undefined
}

const fetchPitchbookRevenue = async (config) => {
  if (!pitchbookKey || !config.pitchbookId) return undefined
  const url = `https://api.pitchbook.com/v1/companies/${encodeURIComponent(
    config.pitchbookId
  )}/financials?metric=Annual%20Revenue`
  const json = await safeJson(url, {
    headers: { Authorization: `Bearer ${pitchbookKey}` },
  })
  const financials = json?.financials ?? json?.data
  if (!Array.isArray(financials)) return undefined
  const latest = financials
    .filter((entry) => entry && (entry.metric?.toLowerCase?.().includes('revenue') || entry.metric === 'Annual Revenue'))
    .sort((a, b) => {
      const dateA = Date.parse(a.asOfDate ?? a.period ?? a.date ?? 0)
      const dateB = Date.parse(b.asOfDate ?? b.period ?? b.date ?? 0)
      return dateB - dateA
    })[0]
  if (!latest) return undefined
  const parsed = parseRevenueValue(latest.value ?? latest.amount ?? latest.reportedValue ?? latest.range)
  return typeof parsed === 'number' ? parsed : undefined
}

const fetchAnnualRevenue = async (config) => {
  const [crunchbaseRevenue, pitchbookRevenue] = await Promise.all([
    fetchCrunchbaseRevenue(config),
    fetchPitchbookRevenue(config),
  ])
  if (typeof crunchbaseRevenue === 'number' && typeof pitchbookRevenue === 'number') {
    return (crunchbaseRevenue + pitchbookRevenue) / 2
  }
  return crunchbaseRevenue ?? pitchbookRevenue
}

const fetchNewsArticles = async (query, pageSize = 20) => {
  if (!newsApiKey) return []
  const url = new URL('https://newsapi.org/v2/everything')
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('language', 'en')
  url.searchParams.set('sortBy', 'publishedAt')
  url.searchParams.set('q', query)
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  url.searchParams.set('from', from)
  const json = await safeJson(url.toString(), {
    headers: { 'X-Api-Key': newsApiKey },
  })
  return Array.isArray(json?.articles) ? json.articles : []
}

const extractFirstMagnitudeMention = (articles, unitsConverter) => {
  for (const article of articles) {
    const text = `${article?.title ?? ''}. ${article?.description ?? ''}. ${article?.content ?? ''}`
    const magnitude = extractMagnitudeFromText(text)
    if (!magnitude) continue
    const converted = unitsConverter(magnitude.value, magnitude.unit)
    if (typeof converted === 'number' && Number.isFinite(converted)) {
      return converted
    }
  }
  return undefined
}

const fetchMonthlyActiveUsers = async (config) => {
  const articles = await fetchNewsArticles(`${config.mauQuery} "monthly active users"`, 15)
  const mau = extractFirstMagnitudeMention(articles, convertToMillions)
  return typeof mau === 'number' ? mau : undefined
}

const POSITIVE_WORDS = new Set([
  'growth',
  'record',
  'profit',
  'strong',
  'surge',
  'breakthrough',
  'success',
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

const fetchSentimentScore = async (config) => {
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

const fetchAlphaVantageDelta = async (symbol) => {
  if (!alphaVantageKey || !symbol) return undefined
  const cached = alphaVantageCache.get(symbol)
  if (cached && Date.now() - cached.timestamp < ALPHA_VANTAGE_CACHE_TTL) {
    return cached.value
  }
  const url = new URL('https://www.alphavantage.co/query')
  url.searchParams.set('function', 'TIME_SERIES_DAILY_ADJUSTED')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('outputsize', 'compact')
  url.searchParams.set('apikey', alphaVantageKey)
  const json = await safeJson(url.toString())
  const series = json?.['Time Series (Daily)']
  if (!series) return undefined
  const dates = Object.keys(series).sort()
  if (dates.length < 2) return undefined
  const latest = series[dates[dates.length - 1]]
  const prior = series[dates[dates.length - 2]]
  if (!latest || !prior) return undefined
  const latestClose = parseFloat(latest['4. close'])
  const priorClose = parseFloat(prior['4. close'])
  if (!Number.isFinite(latestClose) || !Number.isFinite(priorClose) || priorClose === 0) return undefined
  const delta = (latestClose - priorClose) / priorClose
  alphaVantageCache.set(symbol, { timestamp: Date.now(), value: delta })
  return delta
}

const fetchMarketAndVerticalPerformance = async (config) => {
  const [marketPerformance, verticalPerformance] = await Promise.all([
    fetchAlphaVantageDelta(config.marketSymbol),
    fetchAlphaVantageDelta(config.verticalSymbol),
  ])
  return {
    marketPerformance,
    verticalPerformance,
  }
}

const fetchFearGreedIndex = async () => {
  const json = await safeJson('https://api.alternative.me/fng/?limit=1&format=json')
  const value = parseInt(json?.data?.[0]?.value, 10)
  return Number.isFinite(value) ? value : undefined
}

const scrapeLiveMetrics = async (id) => {
  const config = COMPANY_SOURCES[id]
  if (!config) return

  try {
    const [annualRevenue, monthlyActiveUsers, sentimentScore, marketResults, fearGreedIndex] = await Promise.all([
      fetchAnnualRevenue(config),
      fetchMonthlyActiveUsers(config),
      fetchSentimentScore(config),
      fetchMarketAndVerticalPerformance(config),
      fetchFearGreedIndex(),
    ])

    const internal = {}
    const external = {}

    if (typeof annualRevenue === 'number' && Number.isFinite(annualRevenue)) {
      internal.annualRevenue = round2(annualRevenue)
    }
    if (typeof monthlyActiveUsers === 'number' && Number.isFinite(monthlyActiveUsers)) {
      internal.monthlyActiveUsers = Math.max(monthlyActiveUsers, 0)
    }
    if (typeof sentimentScore === 'number' && Number.isFinite(sentimentScore)) {
      internal.sentimentScore = clamp(round3(sentimentScore), -1, 1)
    }
    if (marketResults) {
      if (typeof marketResults.marketPerformance === 'number' && Number.isFinite(marketResults.marketPerformance)) {
        external.marketPerformance = round3(marketResults.marketPerformance)
      }
      if (typeof marketResults.verticalPerformance === 'number' && Number.isFinite(marketResults.verticalPerformance)) {
        external.verticalPerformance = round3(marketResults.verticalPerformance)
      }
    }
    if (typeof fearGreedIndex === 'number' && Number.isFinite(fearGreedIndex)) {
      external.fearGreedIndex = Math.max(Math.min(fearGreedIndex, 100), 0)
    }

    if (Object.keys(internal).length > 0 || Object.keys(external).length > 0) {
      ingestScrapedMetrics(id, { internal, external }, Date.now())
    }
  } catch (error) {
    console.error(`[oracle] Failed to scrape metrics for ${id}:`, error)
  }
}

const shouldRefreshScrape = (id, timestamp) => {
  const cached = scrapedMetricsCache.get(id)
  if (!cached) return true
  if (timestamp - cached.timestamp >= SCRAPE_REFRESH_WINDOW_MS) return true
  return false
}

const triggerScrapeIfNeeded = (id, timestamp) => {
  if (!COMPANY_SOURCES[id]) return
  if (!shouldRefreshScrape(id, timestamp)) return
  if (inFlightScrapes.has(id)) return
  const now = Date.now()
  const lastAttempt = lastScrapeAttempts.get(id)
  if (lastAttempt && now - lastAttempt < SCRAPE_FAILURE_BACKOFF_MS) return
  lastScrapeAttempts.set(id, now)
  const promise = scrapeLiveMetrics(id).finally(() => {
    inFlightScrapes.delete(id)
  })
  inFlightScrapes.set(id, promise)
}

const seededNoise = (timestamp, variant = 1) => {
  const seed = timestamp / STEP_INTERVAL_MS + variant * 17.371
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const getCompanySeed = (id) =>
  id.split('').reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0)

const deepClone = (value) => JSON.parse(JSON.stringify(value))

const mergeMetrics = (defaults, overrides = {}) => ({
  internal: {
    ...defaults.internal,
    ...(overrides.internal ?? {}),
  },
  external: {
    ...defaults.external,
    ...(overrides.external ?? {}),
  },
})

export const ingestScrapedMetrics = (id, data, timestamp = Date.now()) => {
  if (!DEFAULT_BASELINES[id]) {
    throw new Error(`Unknown company "${id}"`)
  }

  const merged = mergeMetrics(DEFAULT_BASELINES[id], data)
  scrapedMetricsCache.set(id, {
    timestamp,
    metrics: merged,
  })
}

const getScrapedMetrics = (id, timestamp) => {
  const defaults = DEFAULT_BASELINES[id]
  if (!defaults) {
    throw new Error(`Missing baseline metrics for company "${id}"`)
  }

  const cached = scrapedMetricsCache.get(id)
  if (cached && timestamp - cached.timestamp <= SCRAPE_CACHE_TTL) {
    return deepClone(mergeMetrics(defaults, cached.metrics))
  }

  // fall back to defaults while waiting for live scrapers to populate cache
  return deepClone(defaults)
}

const applyTemporalDrift = (schema, baseline, timestamp, seed) =>
  schema.reduce((acc, metric, index) => {
    const baseValue = baseline[metric.key] ?? metric.bounds.min
    const noise = seededNoise(timestamp, seed + (index + 1) * 31.71) * metric.jitter
    acc[metric.key] = clamp(baseValue + noise, metric.bounds.min, metric.bounds.max)
    return acc
  }, {})

const fetchMetricSnapshot = (id, timestamp) => {
  triggerScrapeIfNeeded(id, timestamp)
  const baseline = getScrapedMetrics(id, timestamp)
  const seed = getCompanySeed(id)
  return {
    internal: applyTemporalDrift(INTERNAL_SCHEMA, baseline.internal, timestamp, seed),
    external: applyTemporalDrift(EXTERNAL_SCHEMA, baseline.external, timestamp, seed + 97),
  }
}

const computeScoreWithNormalization = (schema, values) =>
  schema.reduce(
    (acc, metric) => {
      const raw = values[metric.key] ?? metric.bounds.min
      const normalized = normalize(raw, metric.bounds)
      acc.score += normalized * metric.weight
      acc.normalized[metric.key] = normalized
      return acc
    },
    { score: 0, normalized: {} }
  )

const computeValuation = (id, metrics) => {
  const { score: internalScore, normalized: normalizedInternal } = computeScoreWithNormalization(
    INTERNAL_SCHEMA,
    metrics.internal
  )
  const { score: externalScore, normalized: normalizedExternal } = computeScoreWithNormalization(
    EXTERNAL_SCHEMA,
    metrics.external
  )
  const compositeScore = internalScore * 0.5 + externalScore * 0.5
  const { floor, ceiling } = PRICE_BANDS[id]
  const targetPrice = floor + compositeScore * (ceiling - floor)

  return {
    internalScore,
    externalScore,
    compositeScore,
    targetPrice,
    normalizedInternal,
    normalizedExternal,
  }
}

const calculatePriceStep = (id, prevPrice, targetPrice, timestamp) => {
  const { floor, ceiling } = PRICE_BANDS[id]
  const anchor = Number.isFinite(prevPrice) ? prevPrice : targetPrice
  const reversion = (targetPrice - anchor) * 0.32
  const macroNoise = seededNoise(timestamp, anchor) * 0.018 * targetPrice
  const microNoise = seededNoise(timestamp, targetPrice) * 0.01 * targetPrice
  const nextPrice = anchor + reversion + macroNoise + microNoise
  return clamp(nextPrice, floor, ceiling)
}

const deriveVolume = (
  id,
  normalizedInternal,
  normalizedExternal,
  compositeScore,
  timestamp,
  price
) => {
  const adoption =
    normalizedInternal.monthlyActiveUsers * 0.6 + normalizedInternal.annualRevenue * 0.4
  const sentiment =
    normalizedInternal.sentimentScore * 0.45 + normalizedExternal.fearGreedIndex * 0.55
  const marketPulse =
    normalizedExternal.marketPerformance * 0.55 + normalizedExternal.verticalPerformance * 0.45
  const base = (adoption * 0.5 + sentiment * 0.25 + marketPulse * 0.25) * 210
  const volatility = 0.85 + compositeScore * 0.3
  const noise = 1 + seededNoise(timestamp, price + getCompanySeed(id)) * 0.22
  return round2(Math.max(0.1, base * volatility * noise))
}

const alignToInterval = (timestamp) =>
  Math.floor(timestamp / STEP_INTERVAL_MS) * STEP_INTERVAL_MS

const bootstrapAsset = (id, alignedTimestamp) => {
  const startTimestamp = alignedTimestamp - STEP_INTERVAL_MS * (HISTORY_LENGTH - 1)
  let previousPrice = null
  let metrics = null
  let valuation = null
  const history = []

  for (let i = 0; i < HISTORY_LENGTH; i += 1) {
    const frameTimestamp = startTimestamp + STEP_INTERVAL_MS * i
    metrics = fetchMetricSnapshot(id, frameTimestamp)
    valuation = computeValuation(id, metrics)
    const price = round2(
      previousPrice === null
        ? valuation.targetPrice
        : calculatePriceStep(id, previousPrice, valuation.targetPrice, frameTimestamp)
    )
    history.push(price)
    previousPrice = price
  }

  const latestPrice = history[history.length - 1]
  const priorPrice = history[history.length - 2] ?? latestPrice
  const change = priorPrice === 0 ? 0 : ((latestPrice - priorPrice) / priorPrice) * 100
  const volume = deriveVolume(
    id,
    valuation.normalizedInternal,
    valuation.normalizedExternal,
    valuation.compositeScore,
    alignedTimestamp,
    latestPrice
  )

  return {
    ...COMPANY_METADATA[id],
    price: latestPrice,
    change: round2(change),
    volume,
    history,
    metrics,
    normalizedMetrics: {
      internal: valuation.normalizedInternal,
      external: valuation.normalizedExternal,
    },
    internalScore: round3(valuation.internalScore),
    externalScore: round3(valuation.externalScore),
    compositeScore: round3(valuation.compositeScore),
    targetPrice: round2(valuation.targetPrice),
  }
}

const advanceAsset = (asset, timestamp) => {
  const metrics = fetchMetricSnapshot(asset.id, timestamp)
  const valuation = computeValuation(asset.id, metrics)
  const nextPrice = round2(
    calculatePriceStep(asset.id, asset.price, valuation.targetPrice, timestamp)
  )
  const change = asset.price === 0 ? 0 : ((nextPrice - asset.price) / asset.price) * 100
  const history = [...asset.history.slice(-(HISTORY_LENGTH - 1)), nextPrice]
  const volume = deriveVolume(
    asset.id,
    valuation.normalizedInternal,
    valuation.normalizedExternal,
    valuation.compositeScore,
    timestamp,
    nextPrice
  )

  return {
    ...asset,
    price: nextPrice,
    change: round2(change),
    volume,
    history,
    metrics,
    normalizedMetrics: {
      internal: valuation.normalizedInternal,
      external: valuation.normalizedExternal,
    },
    internalScore: round3(valuation.internalScore),
    externalScore: round3(valuation.externalScore),
    compositeScore: round3(valuation.compositeScore),
    targetPrice: round2(valuation.targetPrice),
  }
}

export const generateCompanyValuations = (timestamp = Date.now()) => {
  const alignedTimestamp = alignToInterval(timestamp)
  return COMPANY_IDS.map((id) => {
    const metrics = fetchMetricSnapshot(id, alignedTimestamp)
    const valuation = computeValuation(id, metrics)
    const { floor, ceiling } = PRICE_BANDS[id]
    return {
      ...COMPANY_METADATA[id],
      metrics,
      normalizedMetrics: {
        internal: valuation.normalizedInternal,
        external: valuation.normalizedExternal,
      },
      internalScore: round3(valuation.internalScore),
      externalScore: round3(valuation.externalScore),
      compositeScore: round3(valuation.compositeScore),
      targetPrice: round2(valuation.targetPrice),
      priceFloor: floor,
      priceCeiling: ceiling,
      timestamp: alignedTimestamp,
    }
  })
}

export const initializeOracleState = () => {
  const now = alignToInterval(Date.now())
  const assets = COMPANY_IDS.map((id) => bootstrapAsset(id, now))
  return {
    assets,
    lastUpdated: now,
  }
}

export const advanceOracleState = (state, timestamp = Date.now()) => {
  let currentState = state
  const targetTimestamp = alignToInterval(timestamp)

  if (targetTimestamp <= currentState.lastUpdated) {
    return currentState
  }

  while (currentState.lastUpdated + STEP_INTERVAL_MS <= targetTimestamp) {
    const stepTimestamp = currentState.lastUpdated + STEP_INTERVAL_MS
    currentState = {
      assets: currentState.assets.map((asset) => advanceAsset(asset, stepTimestamp)),
      lastUpdated: stepTimestamp,
    }
  }

  return currentState
}

export const getSyntheticAssetSnapshot = (id, timestamp = Date.now()) =>
  bootstrapAsset(id, alignToInterval(timestamp))

export const ORACLE_UPDATE_INTERVAL_MS = STEP_INTERVAL_MS

