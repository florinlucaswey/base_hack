import { resolveEnv, safeJson } from '../shared.js'

const ALPHA_VANTAGE_CACHE_TTL = 15 * 60 * 1000
const alphaVantageCache = new Map()

const alphaVantageKey =
  resolveEnv('VITE_ALPHAVANTAGE_API_KEY') ??
  resolveEnv('ALPHAVANTAGE_API_KEY') ??
  resolveEnv('ALPHA_VANTAGE_KEY')

export const fetchAlphaVantageDelta = async (symbol) => {
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
