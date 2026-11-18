import { liveQuery } from 'dexie'
import type { Place, PlaceStatus } from '~/utils/db'
import { db } from '~/utils/db'

// One live subscription shared by every component.
const places = shallowRef<Place[]>([])
const ready = ref(false)
let started = false
let persistAsked = false

function start() {
  if (started || !import.meta.client) return
  started = true
  liveQuery(() => db.places.orderBy('updatedAt').reverse().toArray()).subscribe({
    next: (rows) => {
      places.value = rows
      ready.value = true
    },
    error: (e) => console.error('[phaenti] db', e),
  })
}

async function requestPersist() {
  if (persistAsked) return
  persistAsked = true
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch { /* not supported */ }
}

export interface NewPlace {
  name: string
  lat: number
  lng: number
  status: PlaceStatus
  address?: string
  source?: Place['source']
}

export interface ExportFile {
  app: 'phaenti'
  version: 1
  exportedAt: string
  places: Place[]
}

export function usePlaces() {
  start()

  async function add(p: NewPlace) {
    const now = Date.now()
    const place: Place = {
      id: crypto.randomUUID(),
      name: p.name.trim() || 'Untitled place',
      lat: +p.lat.toFixed(6),
      lng: +p.lng.toFixed(6),
      status: p.status,
      address: p.address ?? '',
      notes: '',
      rating: 0,
      visitedAt: p.status === 'been' ? new Date().toISOString().slice(0, 10) : null,
      tags: [],
      source: p.source ?? 'map',
      createdAt: now,
      updatedAt: now,
    }
    await db.places.add(place)
    requestPersist()
    return place
  }

  async function update(id: string, patch: Partial<Omit<Place, 'id'>>) {
    await db.places.update(id, { ...patch, updatedAt: Date.now() })
  }

  async function remove(id: string) {
    const old = await db.places.get(id)
    await db.places.delete(id)
    return old
  }

  async function restore(place: Place) {
    await db.places.put(place)
  }

  function toExport(): ExportFile {
    return { app: 'phaenti', version: 1, exportedAt: new Date().toISOString(), places: places.value }
  }

  /** Merge by id; newer updatedAt wins. Returns counts. */
  async function importFile(file: File) {
    const json = JSON.parse(await file.text())
    const incoming: unknown[] = Array.isArray(json?.places)
      ? json.places
      : json?.type === 'FeatureCollection'
        ? json.features.map(fromFeature)
        : []
    let added = 0
    let updated = 0
    await db.transaction('rw', db.places, async () => {
      for (const raw of incoming) {
        const p = normalize(raw)
        if (!p) continue
        const existing = await db.places.get(p.id)
        if (!existing) {
          await db.places.add(p)
          added++
        } else if (p.updatedAt > existing.updatedAt) {
          await db.places.put(p)
          updated++
        }
      }
    })
    requestPersist()
    return { added, updated, total: incoming.length }
  }

  return { places, ready, add, update, remove, restore, toExport, importFile }
}

function fromFeature(f: any) {
  const [lng, lat] = f?.geometry?.coordinates ?? []
  return { ...f?.properties, lat, lng }
}

function normalize(r: any): Place | null {
  const lat = Number(r?.lat)
  const lng = Number(r?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const now = Date.now()
  return {
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
    name: String(r.name ?? r.title ?? 'Imported place').slice(0, 200),
    lat,
    lng,
    status: r.status === 'been' ? 'been' : 'planned',
    address: String(r.address ?? ''),
    notes: String(r.notes ?? ''),
    rating: Math.max(0, Math.min(5, Number(r.rating) || 0)),
    visitedAt: typeof r.visitedAt === 'string' ? r.visitedAt : null,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    source: 'import',
    createdAt: Number(r.createdAt) || now,
    updatedAt: Number(r.updatedAt) || now,
  }
}
