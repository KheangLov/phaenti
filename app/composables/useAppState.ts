// Small shared UI state (client-only app, so module-level refs are safe).
import type { CategoryId } from '~/utils/categories'

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

export type SheetSnap = 'peek' | 'half' | 'full'
export type Filter = 'all' | 'been' | 'planned'

export interface MapApi {
  flyTo: (lng: number, lat: number, zoom?: number) => void
  fitBounds: (bbox: [number, number, number, number], maxZoom?: number) => void
  center: () => { lng: number; lat: number }
  zoom: () => number
  fitAll: () => void
  locate: () => Promise<{ lng: number; lat: number } | null>
  pulse: (lng: number, lat: number, color: string) => void
  offlineInfo: () => OfflineInfo | null
}

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
const searching = ref(false)
const filter = ref<Filter>('all')
const snap = ref<SheetSnap>('peek')
const mapApi = shallowRef<MapApi | null>(null)

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
const showBoundaries = pref('phaenti:boundaries', true)
const showExplored = pref('phaenti:explored', true)

export function useAppState() {
  function select(id: string | null) {
    draft.value = null
    area.value = null
    selectedId.value = id
    snap.value = id ? 'half' : 'peek'
  }
  function openDraft(d: Draft) {
    selectedId.value = null
    area.value = null
    picking.value = false
    draft.value = d
    snap.value = 'half'
  }
  function openArea(a: AreaSelection) {
    selectedId.value = null
    draft.value = null
    area.value = a
    snap.value = 'half'
  }
  function closeAll() {
    selectedId.value = null
    draft.value = null
    area.value = null
    snap.value = 'peek'
  }
  return {
    selectedId, draft, area, picking, searching, filter, snap, mapApi,
    showBoundaries, showExplored, styleChoice,
    select, openDraft, openArea, closeAll,
  }
}
