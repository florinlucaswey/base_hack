import { safeJson } from '../shared.js'

export const fetchFearGreedIndex = async () => {
  const json = await safeJson('https://api.alternative.me/fng/?limit=1&format=json')
  const value = parseInt(json?.data?.[0]?.value, 10)
  return Number.isFinite(value) ? value : undefined
}
