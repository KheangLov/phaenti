// Offline status and "save map area" downloads.
// Tiles are written straight into the same Cache Storage bucket the service
// worker reads from ("map-tiles"), so saved areas work even before the
// service worker has taken control of the page.
import { useOnline } from '@vueuse/core'
import type { OfflineInfo } from '~/composables/useAppState'

export const TILE_CACHE = 'map-tiles'
export const CAMBODIA_BBOX: [number, number, number, number] = [102.3, 10.4, 107.65, 14.7]
const MAX_TILES = 3000
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '768-1023', '6016-6271', '7680-7935', '8192-8447']

const online = useOnline()
const swReady = ref(false)
const persisted = ref<boolean | null>(null)
const usage = ref<{ used: number; quota: number } | null>(null)
const savedTiles = ref<number | null>(null)
const job = ref<{ label: string; done: number; total: number; bytes: number; failed: number } | null>(null)
let cancelled = false

if (import.meta.client) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => (swReady.value = true)).catch(() => {})
  }
}

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat: number, z: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

function tilesIn(bbox: [number, number, number, number], minz: number, maxz: number) {
  const out: [number, number, number][] = []
  for (let z = minz; z <= maxz; z++) {
    const n = 2 ** z
    const x0 = Math.max(0, lon2x(bbox[0], z))
    const x1 = Math.min(n - 1, lon2x(bbox[2], z))
    const y0 = Math.max(0, lat2y(bbox[3], z))
    const y1 = Math.min(n - 1, lat2y(bbox[1], z))
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y])
  }
  return out
}

export interface AreaPlan {
  label: string
  minzoom: number
  maxzoom: number
  urls: string[]
}

/** Build the list of URLs for an area, lowering the max zoom until it fits the tile budget. */
export function planArea(info: OfflineInfo, bbox: [number, number, number, number], minzoom: number, maxzoom: number, label: string): AreaPlan | null {
  if (!info.sources.length) return null
  let maxz = maxzoom
  let tiles: [number, number, number][] = []
  while (maxz >= minzoom) {
    tiles = tilesIn(bbox, minzoom, maxz)
    const total = tiles.length * info.sources.length
    if (total <= MAX_TILES) break
    maxz--
  }
  const urls: string[] = []
  for (const s of info.sources) {
    for (const [z, x, y] of tiles) {
      if (z < s.minzoom || z > s.maxzoom) continue
      const t = s.tiles[(x + y) % s.tiles.length]!
      urls.push(t.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
    }
  }
  // Label fonts for common scripts (Latin, punctuation, Khmer)
  if (info.glyphs) {
    for (const f of info.fonts) {
      for (const r of GLYPH_RANGES) urls.push(info.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r))
    }
  }
  return { label, minzoom, maxzoom: maxz, urls }
}

async function refreshStats() {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      usage.value = { used: e.usage ?? 0, quota: e.quota ?? 0 }
    }
    if (navigator.storage?.persisted) persisted.value = await navigator.storage.persisted()
    if ('caches' in window) {
      const c = await caches.open(TILE_CACHE)
      savedTiles.value = (await c.keys()).length
    }
  } catch { /* storage APIs unavailable */ }
}

async function download(plan: AreaPlan) {
  if (job.value) return
  cancelled = false
  job.value = { label: plan.label, done: 0, total: plan.urls.length, bytes: 0, failed: 0 }
  const cache = await caches.open(TILE_CACHE)
  let i = 0
  const worker = async () => {
    while (i < plan.urls.length && !cancelled) {
      const url = plan.urls[i++]!
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
          if (res.ok) {
            const blob = await res.clone().blob()
            job.value!.bytes += blob.size
            await cache.put(url, res)
          } else if (res.status !== 404) {
            job.value!.failed++
          }
        }
      } catch {
        job.value!.failed++
      }
      job.value!.done++
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  const result = { ...job.value!, cancelled }
  job.value = null
  await refreshStats()
  return result
}

async function clearTiles() {
  await caches.delete(TILE_CACHE)
  await refreshStats()
}

async function requestPersist() {
  try {
    if (navigator.storage?.persist) persisted.value = await navigator.storage.persist()
  } catch { /* ignore */ }
  return persisted.value
}

export function isStandalone() {
  if (!import.meta.client) return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export function platform(): 'ios' | 'android' | 'other' {
  if (!import.meta.client) return 'other'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export function useOffline() {
  return {
    online, swReady, persisted, usage, savedTiles, job,
    refreshStats, download, clearTiles, requestPersist,
    cancel: () => (cancelled = true),
  }
}
