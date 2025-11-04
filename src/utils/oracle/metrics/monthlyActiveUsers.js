import {
  convertToMillions,
  extractMagnitudeFromText,
  fetchNewsArticles,
} from '../shared.js'

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

export const fetchMonthlyActiveUsers = async (config) => {
  const articles = await fetchNewsArticles(`${config.mauQuery} "monthly active users"`, 15)
  const mau = extractFirstMagnitudeMention(articles, convertToMillions)
  return typeof mau === 'number' ? mau : undefined
}
