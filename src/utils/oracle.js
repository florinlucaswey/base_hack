import { clamp } from './oracle/shared.js'
import { fetchAnnualRevenue } from './oracle/metrics/annualRevenue.js'
import { fetchMonthlyActiveUsers } from './oracle/metrics/monthlyActiveUsers.js'
import { fetchSentimentScore } from './oracle/metrics/sentimentScore.js'
import { fetchMarketPerformance } from './oracle/metrics/marketPerformance.js'
import { fetchVerticalPerformance } from './oracle/metrics/verticalPerformance.js'
import { fetchFearGreedIndex } from './oracle/metrics/fearGreedIndex.js'

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

const scrapeLiveMetrics = async (id) => {
  const config = COMPANY_SOURCES[id]
  if (!config) return

  try {
    const [
      annualRevenue,
      monthlyActiveUsers,
      sentimentScore,
      marketPerformance,
      verticalPerformance,
      fearGreedIndex,
    ] = await Promise.all([
      fetchAnnualRevenue(config),
      fetchMonthlyActiveUsers(config),
      fetchSentimentScore(config),
      fetchMarketPerformance(config),
      fetchVerticalPerformance(config),
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
    if (typeof marketPerformance === 'number' && Number.isFinite(marketPerformance)) {
      external.marketPerformance = round3(marketPerformance)
    }
    if (typeof verticalPerformance === 'number' && Number.isFinite(verticalPerformance)) {
      external.verticalPerformance = round3(verticalPerformance)
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

