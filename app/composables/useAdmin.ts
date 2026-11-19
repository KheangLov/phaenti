// Cambodia administrative areas: names (Latin + Khmer), hierarchy, point lookup,
// search across provinces, districts, communes and villages. Data is static and
// loaded lazily from /admin/*.json, then cached offline by the service worker.

type Bbox = [number, number, number, number]
type AreaRow = [level: number, en: string, km: string, unitEn: string, unitKm: string, bbox: Bbox, center: [number, number], wiki: string]
interface AdminIndex {
  areas: Record<string, AreaRow>
  villages: [code: string, en: string, km: string][]
  extra: [code: string, level: number, en: string, km: string, unitEn: string, unitKm: string][]
}
type LookupRow = [commune: string, district: string, province: string, bbox: Bbox, rings: [number, number][][]]

export interface AreaInfo {
  code: string
  level: 1 | 2 | 3 | 4
  name: string
  km: string
  unitEn: string
  unitKm: string
  bbox: Bbox | null
  center: [number, number] | null
  wiki: string
}

export interface AdminHit {
  code: string
  level: 1 | 2 | 3 | 4
  name: string
  km: string
  unit: string
  unitKm: string
  sub: string
  subKm: string
  score: number
}

export interface AdminCodes { p: string; d: string; c: string }

export const ADMIN_TOTALS = { provinces: 25, districts: 197, communes: 1633 }
export const LEVEL_LABEL: Record<number, string> = { 1: 'Province', 2: 'District', 3: 'Commune', 4: 'Village' }

const index = shallowRef<AdminIndex | null>(null)
const lookup = shallowRef<LookupRow[] | null>(null)
let indexP: Promise<void> | null = null
let lookupP: Promise<void> | null = null

interface Entry { code: string; level: 1 | 2 | 3 | 4; en: string; n: string; km: string; unit: string; unitKm: string }
let entries: Entry[] = []
const names = new Map<string, string>()
const namesKm = new Map<string, string>()
export const UNIT_KM: Record<number, string> = { 1: 'ខេត្ត', 2: 'ស្រុក', 3: 'ឃុំ', 4: 'ភូមិ' }

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function loadIndex() {
  indexP ??= fetch('/admin/admin-index.json')
    .then(r => r.json())
    .then((d: AdminIndex) => {
      const list: Entry[] = []
      for (const [code, a] of Object.entries(d.areas)) {
        names.set(code, a[1])
        if (a[2]) namesKm.set(code, a[2])
        list.push({ code, level: a[0] as 1 | 2 | 3, en: a[1], n: strip(a[1]), km: a[2], unit: a[3] || LEVEL_LABEL[a[0]]!, unitKm: a[4] || UNIT_KM[a[0]]! })
      }
      for (const [code, level, en, km, unitEn, unitKm] of d.extra) {
        if (!names.has(code)) names.set(code, en)
        if (km && !namesKm.has(code)) namesKm.set(code, km)
        list.push({ code, level: level as 2 | 3, en, n: strip(en), km, unit: unitEn || LEVEL_LABEL[level]!, unitKm: unitKm || UNIT_KM[level]! })
      }
      for (const [code, en, km] of d.villages) {
        list.push({ code, level: 4, en, n: strip(en), km, unit: 'Village', unitKm: 'ភូមិ' })
      }
      entries = list
      index.value = d
    })
    .catch((e) => {
      indexP = null
      throw e
    })
  return indexP
}

function loadLookup() {
  lookupP ??= fetch('/admin/admin-lookup.json')
    .then(r => r.json())
    .then((d: LookupRow[]) => void (lookup.value = d))
    .catch((e) => {
      lookupP = null
      throw e
    })
  return lookupP
}

function inRing(x: number, y: number, ring: [number, number][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Which commune / district / province contains this point (Cambodia only). */
function locate(lat: number, lng: number): AdminCodes | null {
  const rows = lookup.value
  if (!rows) return null
  if (lng < 102.2 || lng > 107.7 || lat < 10.3 || lat > 14.8) return null
  const x = lng * 1e4
  const y = lat * 1e4
  for (const [c, d, p, b, rings] of rows) {
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue
    for (const ring of rings) if (inRing(x, y, ring)) return { p, d, c }
  }
  return null
}

function parentsOf(code: string, level: number): string[] {
  if (level === 4) return [code.slice(0, 6), code.slice(0, 4), code.slice(0, 2)]
  if (level === 3) return [code.slice(0, 4), code.slice(0, 2)]
  if (level === 2) return [code.slice(0, 2)]
  return []
}

function area(code: string): AreaInfo | null {
  const d = index.value
  if (!d) return null
  const a = d.areas[code]
  if (a) return { code, level: a[0] as 1 | 2 | 3, name: a[1], km: a[2], unitEn: a[3] || LEVEL_LABEL[a[0]]!, unitKm: a[4], bbox: a[5], center: a[6], wiki: a[7] }
  const e = d.extra.find(x => x[0] === code)
  if (e) return { code, level: e[1] as 2 | 3, name: e[2], km: e[3], unitEn: e[4] || LEVEL_LABEL[e[1]]!, unitKm: e[5], bbox: null, center: null, wiki: '' }
  return null
}

/** Nearest ancestor (or self) that has a polygon on the map. */
function mappable(code: string, level: number): AreaInfo | null {
  for (const c of [code, ...parentsOf(code, level)]) {
    const a = area(c)
    if (a?.bbox) return a
  }
  return null
}

function children(code: string): AreaInfo[] {
  const d = index.value
  if (!d || code.length > 4) return []
  const want = code.length === 2 ? 2 : 3
  const out: AreaInfo[] = []
  for (const c of Object.keys(d.areas)) {
    if (c.startsWith(code) && d.areas[c]![0] === want) out.push(area(c)!)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function chain(code: string, level: number, khmer = false): string {
  return parentsOf(code, level).map(c => (khmer ? namesKm.get(c) ?? names.get(c) : names.get(c))).filter(Boolean).join(khmer ? ' · ' : ', ')
}

function search(q: string, limit = 8): AdminHit[] {
  const s = q.trim()
  if (s.length < 2 || !entries.length) return []
  const n = strip(s)
  const isKm = /[ក-៿]/.test(s)
  const out: AdminHit[] = []
  for (const e of entries) {
    let score = -1
    if (isKm) {
      if (e.km.startsWith(s)) score = 0
      else if (e.km.includes(s)) score = 20
    } else {
      if (e.n === n) score = -5
      else if (e.n.startsWith(n)) score = 0
      else if (e.n.includes(` ${n}`)) score = 10
      else if (n.length >= 3 && e.n.includes(n)) score = 20
    }
    if (score < 0 && score !== -5) continue
    score += e.level * 3
    out.push({ code: e.code, level: e.level, name: e.en, km: e.km, unit: e.unit, unitKm: e.unitKm, sub: chain(e.code, e.level), subKm: chain(e.code, e.level, true), score })
  }
  out.sort((a, b) => a.score - b.score || a.name.length - b.name.length)
  return out.slice(0, limit)
}

export function useAdmin() {
  if (import.meta.client && !indexP) {
    // Warm up after first paint
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200))
    idle(() => {
      loadIndex().catch(() => {})
      loadLookup().catch(() => {})
    })
  }
  return {
    index, lookup, loadIndex, loadLookup,
    ready: computed(() => !!index.value),
    lookupReady: computed(() => !!lookup.value),
    area, mappable, chain, parentsOf, children, locate, search,
  }
}

// ---------- Places × areas: shared derived stats ----------
const { places } = usePlaces()

export const placeAdmin = computed(() => {
  const m = new Map<string, AdminCodes>()
  if (!lookup.value) return m
  for (const p of places.value) {
    const r = locate(p.lat, p.lng)
    if (r) m.set(p.id, r)
  }
  return m
})

/** Counts of places per admin code (all levels), split by status. */
export const adminCounts = computed(() => {
  const been = new Map<string, number>()
  const all = new Map<string, number>()
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const p of places.value) {
    const a = placeAdmin.value.get(p.id)
    if (!a) continue
    for (const k of [a.p, a.d, a.c]) {
      inc(all, k)
      if (p.status === 'been') inc(been, k)
    }
  }
  return { been, all }
})

export const explored = computed(() => {
  let provinces = 0
  let districts = 0
  let communes = 0
  for (const k of adminCounts.value.been.keys()) {
    if (k.length === 2) provinces++
    else if (k.length === 4) districts++
    else communes++
  }
  return { provinces, districts, communes }
})
