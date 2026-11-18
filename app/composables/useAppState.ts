// Small shared UI state (client-only app, so module-level refs are safe).

export interface Draft {
  name: string
  address: string
  lat: number
  lng: number
  source: 'map' | 'search' | 'location'
  loading?: boolean
}

export type SheetSnap = 'peek' | 'half' | 'full'
export type Filter = 'all' | 'been' | 'planned'

export interface MapApi {
  flyTo: (lng: number, lat: number, zoom?: number) => void
  center: () => { lng: number; lat: number }
  fitAll: () => void
  locate: () => Promise<{ lng: number; lat: number } | null>
  pulse: (lng: number, lat: number, color: string) => void
}

const selectedId = ref<string | null>(null)
const draft = ref<Draft | null>(null)
const picking = ref(false)
const filter = ref<Filter>('all')
const snap = ref<SheetSnap>('peek')
const mapApi = shallowRef<MapApi | null>(null)

export function useAppState() {
  function select(id: string | null) {
    draft.value = null
    selectedId.value = id
    snap.value = id ? 'half' : 'peek'
  }
  function openDraft(d: Draft) {
    selectedId.value = null
    picking.value = false
    draft.value = d
    snap.value = 'half'
  }
  function closeAll() {
    selectedId.value = null
    draft.value = null
    snap.value = 'peek'
  }
  return { selectedId, draft, picking, filter, snap, mapApi, select, openDraft, closeAll }
}
