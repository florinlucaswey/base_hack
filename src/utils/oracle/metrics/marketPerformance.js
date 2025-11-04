import { fetchAlphaVantageDelta } from './alphaVantage.js'

export const fetchMarketPerformance = async (config) => {
  if (!config) return undefined
  return fetchAlphaVantageDelta(config.marketSymbol)
}
