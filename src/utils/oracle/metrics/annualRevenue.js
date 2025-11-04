import {
  convertToBillions,
  extractMagnitudeFromText,
  resolveEnv,
  safeJson,
} from '../shared.js'

const parseRevenueValue = (raw) => {
  if (typeof raw === 'number') {
    return raw > 10_000 ? raw / 1_000_000_000 : raw
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.includes('-')) {
      const [low, high] = trimmed.split('-').map((part) => part.trim())
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

const fetchCrunchbaseRevenue = async (config) => {
  if (!crunchbaseKey || !config.crunchbaseId) return undefined
  const url = new URL(
    `https://api.crunchbase.com/api/v4/entities/organizations/${encodeURIComponent(config.crunchbaseId)}`
  )
  url.searchParams.set('user_key', crunchbaseKey)
  url.searchParams.set('field_ids', 'financials,revenue_range,annual_revenue')
  const json = await safeJson(url.toString())
  const annualRevenue =
    json?.data?.properties?.annual_revenue ??
    json?.data?.properties?.revenue_range?.value ??
    json?.data?.properties?.financials
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

export const fetchAnnualRevenue = async (config) => {
  const [crunchbaseRevenue, pitchbookRevenue] = await Promise.all([
    fetchCrunchbaseRevenue(config),
    fetchPitchbookRevenue(config),
  ])
  if (typeof crunchbaseRevenue === 'number' && typeof pitchbookRevenue === 'number') {
    return (crunchbaseRevenue + pitchbookRevenue) / 2
  }
  return crunchbaseRevenue ?? pitchbookRevenue
}
