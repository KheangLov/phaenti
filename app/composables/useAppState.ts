// Small shared UI state (client-only app, so module-level refs are safe).
import type { CategoryId, PersonalId } from '~/utils/categories'
import type { TravelMode } from '~/composables/useRouting'
import type { LngLat } from '~/utils/geo'
import { isHiddenPoint } from '~/composables/useHidden'
const { t } = useLang()

export interface Draft {
  name: string
  category: CategoryId
  address: string
  lat: number
  lng: number
  source: 'map' | 'search' | 'location'
  loading?: boolean
}

export interface AreaSelection {
  code: string
  village?: { code: string; name: string; km: string }
}

export interface RouteEnd { lat: number; lng: number; name: string; kind: 'me' | 'place' | 'centre' }
export interface RouteRequest { to: RouteEnd; from: RouteEnd | null; mode: TravelMode }

export type SheetSnap = 'peek' | 'half' | 'full'
export type Filter = 'all' | 'been' | 'planned' | PersonalId

export interface MapApi {
  flyTo: (lng: number, lat: number, zoom?: number, pad?: Partial<{ top: number; bottom: number; left: number; right: number }>) => void
  fitBounds: (bbox: [number, number, number, number], maxZoom?: number) => void
  center: () => { lng: number; lat: number }
  zoom: () => number
  fitAll: () => void
  locate: () => Promise<{ lng: number; lat: number } | null>
  pulse: (lng: number, lat: number, color: string) => void
  offlineInfo: () => OfflineInfo | null
  showRoute: (coords: LngLat[], color: string) => void
  clearRoute: () => void
  /** North up and flat again */
  resetNorth: () => void
  /** My-location button: off → follow → compass → follow … */
  cycleLocate: () => Promise<boolean>
}

/** Live camera, for the compass and scale bar */
export interface Camera { bearing: number; pitch: number; zoom: number; lat: number }
export type LocateMode = 'off' | 'shown' | 'follow' | 'compass'

export interface OfflineInfo {
  sources: { tiles: string[]; minzoom: number; maxzoom: number }[]
  glyphs: string | null
  fonts: string[]
  bounds: [number, number, number, number]
  zoom: number
}

const selectedId = ref<string | null>(null)
const draft = ref<Draft | null>(null)
const area = ref<AreaSelection | null>(null)
const picking = ref(false)
/** Category to give the next place dropped with the + picker (e.g. "home") */
const pendingCategory = ref<CategoryId | null>(null)
const searching = ref(false)
const filter = ref<Filter>('all')
const snap = ref<SheetSnap>('peek')
const mapApi = shallowRef<MapApi | null>(null)
const route = ref<RouteRequest | null>(null)
const measuring = ref(false)
const measurePts = shallowRef<LngLat[]>([])
const measureClosed = ref(false)
const camera = shallowRef<Camera>({ bearing: 0, pitch: 0, zoom: 6, lat: 12.5 })
const zooming = ref(false)
const locateMode = ref<LocateMode>('off')
/** Full-screen photo viewer */
const photoViewer = ref<{ placeId: string; index: number } | null>(null)
/** Discover famous places sheet */
const discoverOpen = ref(false)

function pref(key: string, fallback: boolean) {
  const r = ref(fallback)
  if (import.meta.client) {
    try {
      const v = localStorage.getItem(key)
      if (v != null) r.value = v === '1'
    } catch { /* ignore */ }
    watch(r, (v) => {
      try { localStorage.setItem(key, v ? '1' : '0') } catch { /* ignore */ }
    })
  }
  return r
}
const styleChoice = ref('auto')
if (import.meta.client) {
  try { styleChoice.value = localStorage.getItem('phaenti:style') || 'auto' } catch { /* ignore */ }
  watch(styleChoice, (v) => {
    try { localStorage.setItem('phaenti:style', v) } catch { /* ignore */ }
  })
}
function lastMode(): TravelMode {
  try {
    const m = localStorage.getItem('phaenti:mode')
    if (m === 'car' || m === 'moto' || m === 'bike' || m === 'walk') return m
  } catch { /* ignore */ }
  return 'moto'
}
const showBoundaries = pref('phaenti:boundaries', true)
const showExplored = pref('phaenti:explored', true)
/** Satellite: roads & labels on top, and 3D terrain */
const satLabels = pref('phaenti:sat-labels', true)
const satTerrain = pref('phaenti:sat-terrain', false)
/** Sharper satellite on high-res screens (more data) */
const satHD = pref('phaenti:sat-hd', true)
/** Live layers */
const showTraffic = pref('phaenti:traffic', false)
const showStreet = pref('phaenti:street', false)
/** Street-level photo viewer (Mapillary) */
const streetView = ref<{ imageId: string; lat: number; lng: number } | null>(null)
const satSource = ref<'latest' | 'clarity'>('clarity')
if (import.meta.client) {
  try { if (localStorage.getItem('phaenti:sat-source') === 'latest') satSource.value = 'latest' } catch { /* ignore */ }
  watch(satSource, (v) => { try { localStorage.setItem('phaenti:sat-source', v) } catch { /* ignore */ } })
}

export function useAppState() {
  function select(id: string | null) {
    route.value = null
    draft.value = null
    area.value = null
    selectedId.value = id
    snap.value = id ? 'half' : 'peek'
  }
  /** Returns false when the spot is in a hidden country. */
  function openDraft(d: Draft) {
    if (isHiddenPoint(d.lat, d.lng)) {
      useToast().add({ title: t('hidden.title'), description: t('hidden.body'), icon: 'i-lucide-map-pin-off', color: 'warning' })
      return false
    }
    selectedId.value = null
    area.value = null
    route.value = null
    picking.value = false
    draft.value = d
    snap.value = 'half'
    return true
  }
  function openArea(a: AreaSelection) {
    route.value = null
    selectedId.value = null
    draft.value = null
    area.value = a
    snap.value = 'half'
  }
  function openRoute(to: RouteEnd, mode?: TravelMode) {
    measuring.value = false
    route.value = { to, from: route.value?.from ?? null, mode: mode ?? route.value?.mode ?? lastMode() }
    snap.value = 'half'
  }
  function closeAll() {
    route.value = null
    selectedId.value = null
    draft.value = null
    area.value = null
    snap.value = 'peek'
  }
  return {
    selectedId, draft, area, picking, pendingCategory, searching, filter, snap, mapApi,
    route, measuring, measurePts, measureClosed, openRoute, photoViewer, discoverOpen,
    camera, zooming, locateMode,
    showBoundaries, showExplored, styleChoice, satLabels, satTerrain, satHD, satSource, showTraffic, showStreet, streetView,
    select, openDraft, openArea, closeAll,
  }
}
