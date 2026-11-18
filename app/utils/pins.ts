// Draws category pins (SVG -> bitmap) once and registers them with MapLibre.
// Every marker on the map is then a GPU symbol, not a DOM element.
import type { Map as MLMap } from 'maplibre-gl'
import { CATEGORIES, type Category } from './categories'
import { ICON_BODIES } from './iconBodies'
import { STATUS_COLORS, type PlaceStatus } from './db'

const W = 44 // logical px
const H = 54
const RATIO = 2

function pinSvg(c: Category, status: PlaceStatus) {
  const planned = status === 'planned'
  const body = ICON_BODIES[c.icon] ?? ICON_BODIES['map-pin']
  const badge = planned ? ICON_BODIES.heart : ICON_BODIES.check
  const badgeColor = STATUS_COLORS[status]
  // Teardrop pin: filled gradient for "been", white with coloured ring for "want to go"
  const fill = planned ? '#ffffff' : `url(#g)`
  const iconColor = planned ? c.color : '#ffffff'
  const stroke = planned ? c.color : '#ffffff'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * RATIO}" height="${H * RATIO}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="${c.color2}"/></linearGradient>
    <filter id="s" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#000" flood-opacity="0.32"/></filter>
  </defs>
  <ellipse cx="20" cy="51.2" rx="5.5" ry="1.8" fill="#000" opacity="0.22"/>
  <path filter="url(#s)" d="M20 3C11.2 3 4.5 9.7 4.5 18.3c0 10.4 12.2 23.4 14.4 25.7a1.5 1.5 0 0 0 2.2 0c2.2-2.3 14.4-15.3 14.4-25.7C35.5 9.7 28.8 3 20 3Z" fill="${fill}" stroke="${stroke}" stroke-width="${planned ? 2.6 : 2.2}"/>
  <g transform="translate(11.6 9.9) scale(0.7)" color="${iconColor}">${body}</g>
  <circle cx="33.5" cy="8.5" r="7" fill="${badgeColor}" stroke="#fff" stroke-width="2"/>
  <g transform="translate(29.3 4.3) scale(0.35)" color="#fff">${badge.replace(/stroke-width="2"/g, 'stroke-width="3.4"')}</g>
</svg>`
}

async function rasterize(svg: string) {
  const img = new Image(W * RATIO, H * RATIO)
  img.decoding = 'async'
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = W * RATIO
  canvas.height = H * RATIO
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

let cache: Map<string, ImageData> | null = null

export async function ensurePinImages(map: MLMap) {
  if (!cache) {
    cache = new Map()
    const jobs: Promise<void>[] = []
    for (const c of CATEGORIES) {
      for (const s of ['been', 'planned'] as PlaceStatus[]) {
        jobs.push(rasterize(pinSvg(c, s)).then(d => void cache!.set(`pin-${c.id}-${s}`, d)))
      }
    }
    await Promise.all(jobs)
  }
  for (const [name, data] of cache) {
    if (!map.hasImage(name)) map.addImage(name, data, { pixelRatio: RATIO })
  }
}

/** Same artwork as a data URL, for use in HTML (lists, cards). */
const urlCache = new Map<string, string>()
export function pinDataUrl(categoryId: string, status: PlaceStatus) {
  const key = `${categoryId}-${status}`
  let u = urlCache.get(key)
  if (!u) {
    const c = CATEGORIES.find(x => x.id === categoryId) ?? CATEGORIES[CATEGORIES.length - 1]!
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(c, status))}`
    urlCache.set(key, u)
  }
  return u
}
