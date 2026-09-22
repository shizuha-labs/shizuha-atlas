import { safeSourceUrl } from './atlasGraph.js'

export async function openAtlasSource(event, sourceUrl, onOpenSource) {
  const url = safeSourceUrl(sourceUrl)
  if (!url) {
    event.preventDefault()
    throw new Error('Source URL is not allowed')
  }
  if (!onOpenSource) return false
  event.preventDefault()
  await onOpenSource(url)
  return true
}

export async function shareAtlasView({ search, locationHref, onShareView, clipboard }) {
  const url = new URL(locationHref)
  url.search = search
  if (onShareView) {
    await onShareView({ search, url: url.href })
    return 'shared'
  }
  await clipboard.writeText(url.href)
  return 'copied'
}
