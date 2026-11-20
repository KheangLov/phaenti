import { liveQuery } from 'dexie'
import type { Place, PlaceStatus } from '~/utils/db'
import { CATEGORY_MAP, isPersonal, type CategoryId } from '~/utils/categories'
import { db } from '~/utils/db'
import { cleanUpPhotos, cleanPhotoLink, photosForBackup, restorePhotos } from '~/utils/photos'

import { isHiddenPoint, useHidden } from '~/composables/useHidden'

// One live subscription shared by every component.
const allPlaces = shallowRef<Place[]>([])
const hidden = useHidden()
// Places inside hidden countries stay in the database but never show up.
const places = computed(() => (hidden.ready.value ? allPlaces.value.filter(p => !isHiddenPoint(p.lat, p.lng)) : allPlaces.value))
const ready = ref(false)
let started = false
let persistAsked = false

function start() {
  if (started || !import.meta.client) return
  started = true
  liveQuery(() => db.places.orderBy('updatedAt').reverse().toArray()).subscribe({
    next: (rows) => {
      allPlaces.value = rows
      ready.value = true
    },
    error: (e) => console.error('[phaenti] db', e),
  })
  // Tidy photos left behind by deleted places (from earlier sessions, so undo still works now)
  setTimeout(() => void cleanUpPhotos().catch(() => {}), 8000)
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
  category?: CategoryId
  person?: string
  address?: string
  notes?: string
  tags?: string[]
  photos?: string[]
  discoverId?: string
  source?: Place['source']
}

export interface ExportFile {
  app: 'phaenti'
  version: 1
  exportedAt: string
  places: Place[]
  /** Photos kept on the device, as data URLs keyed by id */
  photoData?: Record<string, string>
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
      category: p.category ?? 'other',
      ...(p.person ? { person: p.person.trim() } : {}),
      address: p.address ?? '',
      notes: p.notes ?? '',
      rating: 0,
      visitedAt: p.status === 'been' && !isPersonal(p.category) ? new Date().toISOString().slice(0, 10) : null,
      tags: p.tags ?? [],
      ...(p.photos?.length ? { photos: p.photos } : {}),
      ...(p.discoverId ? { discoverId: p.discoverId } : {}),
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

  async function toExport(): Promise<ExportFile> {
    const places = allPlaces.value
    const photoData = await photosForBackup(places.flatMap(p => p.photos ?? []))
    return { app: 'phaenti', version: 1, exportedAt: new Date().toISOString(), places, ...(Object.keys(photoData).length ? { photoData } : {}) }
  }

  /** Add many at once (e.g. a Discover collection) in one transaction */
  async function addMany(list: NewPlace[]) {
    const out: Place[] = []
    await db.transaction('rw', db.places, async () => {
      for (const p of list) out.push(await add(p))
    })
    return out
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
    await restorePhotos(json?.photoData)
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

  return { places, allPlaces, ready, add, addMany, update, remove, restore, toExport, importFile }
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
    category: r.category in CATEGORY_MAP ? r.category : 'other',
    ...(typeof r.person === 'string' && r.person ? { person: r.person.slice(0, 120) } : {}),
    address: String(r.address ?? ''),
    notes: String(r.notes ?? ''),
    rating: Math.max(0, Math.min(5, Number(r.rating) || 0)),
    visitedAt: typeof r.visitedAt === 'string' ? r.visitedAt : null,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    ...(Array.isArray(r.photos) ? { photos: cleanPhotos(r.photos) } : {}),
    ...(typeof r.discoverId === 'string' && r.discoverId ? { discoverId: r.discoverId.slice(0, 80) } : {}),
    source: 'import',
    createdAt: Number(r.createdAt) || now,
    updatedAt: Number(r.updatedAt) || now,
  }
}

function cleanPhotos(list: unknown[]): string[] {
  const out: string[] = []
  for (const x of list) {
    if (typeof x !== 'string') continue
    if (/^local:[\w-]{8,64}$/.test(x)) out.push(x)
    else {
      const u = cleanPhotoLink(x)
      if (u) out.push(u)
    }
  }
  return out.slice(0, 30)
}
