// Discover: a hand-picked collection of famous and beautiful places in Cambodia
// (public/discover/cambodia.json), enriched on the phone with a photo, exact
// coordinates and a short description from Wikipedia. Wikipedia answers are
// kept for a month so the collection works offline after the first look.
import type { CategoryId } from '~/utils/categories'
import { haversineKm } from '~/utils/geo'
import { isHiddenPoint } from '~/composables/useHidden'

export interface DiscoverPlace {
  id: string
  wiki: string
  name: string
  km: string
  category: CategoryId
  lat: number
  lng: number
  blurb: string
  blurbKm: string
  /** From Wikipedia, when available */
  photo?: string
  page?: string
  extract?: string
}

interface WikiInfo { lat?: number; lng?: number; photo?: string; page?: string; extract?: string }
const CACHE_KEY = 'phaenti:discover-wiki'
const MAX_AGE = 30 * 24 * 3600 * 1000

const base = shallowRef<DiscoverPlace[]>([])
const wiki = shallowRef<Record<string, WikiInfo>>({})
const loading = ref(false)
const failed = ref(false)
let started: Promise<void> | null = null

function readCache(): Record<string, WikiInfo> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (raw && Date.now() - raw.at < MAX_AGE) return raw.data
  } catch { /* ignore */ }
  return null
}

async function fetchWiki(titles: string[]): Promise<Record<string, WikiInfo>> {
  const out: Record<string, WikiInfo> = {}
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20)
    for (const t of chunk) out[t] = {} // remember misses too, so we don't ask again
    const q = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1',
      prop: 'coordinates|pageimages|extracts|info', inprop: 'url',
      piprop: 'thumbnail', pithumbsize: '960',
      exintro: '1', explaintext: '1', exsentences: '2', exlimit: 'max',
      titles: chunk.join('|'),
    })
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`)
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    // Map normalised/redirected titles back to what we asked for
    const back = new Map<string, string>()
    for (const t of chunk) back.set(t, t)
    for (const n of json.query?.normalized ?? []) back.set(n.to, back.get(n.from) ?? n.from)
    for (const r of json.query?.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from)
    for (const p of json.query?.pages ?? []) {
      if (p.missing) continue
      const asked = back.get(p.title) ?? p.title
      const c = p.coordinates?.[0]
      out[asked] = {
        ...(c ? { lat: c.lat, lng: c.lon } : {}),
        ...(p.thumbnail?.source ? { photo: p.thumbnail.source } : {}),
        ...(p.fullurl ? { page: p.fullurl } : {}),
        ...(p.extract ? { extract: String(p.extract).slice(0, 400) } : {}),
      }
    }
  }
  return out
}

function start() {
  if (started) return started
  started = (async () => {
    loading.value = true
    try {
      const res = await fetch('/discover/cambodia.json')
      base.value = (await res.json()).places
      const cached = readCache() ?? {}
      wiki.value = cached
      // Only ask Wikipedia about places it hasn't told us about yet (e.g. newly added to the collection)
      const missing = base.value.map(p => p.wiki).filter(t => !(t in cached))
      if (missing.length && navigator.onLine !== false) {
        try {
          wiki.value = { ...cached, ...(await fetchWiki(missing)) }
          let at = Date.now()
          try { at = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')?.at ?? at } catch { /* ignore */ }
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Object.keys(cached).length ? at : Date.now(), data: wiki.value }))
        } catch {
          failed.value = true
        }
      }
    } finally {
      loading.value = false
    }
  })()
  return started
}

const places = computed<DiscoverPlace[]>(() => base.value
  .map((p) => {
    const w = wiki.value[p.wiki]
    // Trust Wikipedia's pin only when it agrees with ours (guards against a wrong article)
    const useWiki = w?.lat != null && w.lng != null && haversineKm([p.lng, p.lat], [w.lng, w.lat]) < 8
    return {
      ...p,
      ...(useWiki ? { lat: +w!.lat!.toFixed(6), lng: +w!.lng!.toFixed(6) } : {}),
      ...(w?.photo ? { photo: w.photo } : {}),
      ...(w?.page ? { page: w.page } : {}),
      ...(w?.extract ? { extract: w.extract } : {}),
    }
  })
  .filter(p => !isHiddenPoint(p.lat, p.lng)))

export function useDiscover() {
  if (import.meta.client) void start()
  return { places, loading, failed }
}
