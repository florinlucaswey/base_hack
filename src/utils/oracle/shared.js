const SCRAPE_REQUEST_TIMEOUT_MS = 10_000

export const resolveEnv = (key) => {
  const globalProcess = typeof globalThis !== 'undefined' ? globalThis.process : undefined
  if (globalProcess && globalProcess.env && globalProcess.env[key] !== undefined) {
    return globalProcess.env[key]
  }
  const importMetaEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  if (importMetaEnv && importMetaEnv[key] !== undefined) {
    return importMetaEnv[key]
  }
  return undefined
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const fetchWithTimeout = async (input, init = {}, timeout = SCRAPE_REQUEST_TIMEOUT_MS) => {
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

export const safeJson = async (input, init, timeout) => {
  try {
    const response = await fetchWithTimeout(input, init, timeout)
    return await response.json()
  } catch (error) {
    console.error('[oracle] JSON fetch failed:', error)
    return undefined
  }
}

const magnitudeRegex = /(\d[\d,.]*)\s?(billion|million|thousand|bn|mm|m|k|b|mn)/i

export const extractMagnitudeFromText = (text) => {
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

export const convertToBillions = (value, unit) => {
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

export const convertToMillions = (value, unit) => {
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

const newsApiKey =
  resolveEnv('VITE_NEWSAPI_KEY') ?? resolveEnv('NEWSAPI_KEY') ?? resolveEnv('NEWS_API_KEY')

export const fetchNewsArticles = async (query, pageSize = 20) => {
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
