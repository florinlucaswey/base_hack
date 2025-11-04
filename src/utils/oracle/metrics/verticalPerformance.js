import { fetchAlphaVantageDelta } from './alphaVantage.js'

export const fetchVerticalPerformance = async (config) => {
  if (!config) return undefined
  return fetchAlphaVantageDelta(config.verticalSymbol)
}
