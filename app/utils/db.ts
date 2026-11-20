import Dexie, { type EntityTable } from 'dexie'
import type { CategoryId } from './categories'

export type PlaceStatus = 'been' | 'planned'

export interface Place {
  id: string
  name: string
  lat: number
  lng: number
  status: PlaceStatus
  category: CategoryId
  /** For personal places: who lives or works there (e.g. "Grandma", "Uncle Sok") */
  person?: string
  address: string
  notes: string
  rating: number // 0 = unrated, 1..5
  visitedAt: string | null // YYYY-MM-DD
  tags: string[]
  /** Cover first. Each entry is a web link (https://…) or a photo kept on this device (local:<id>) */
  photos?: string[]
  /** Set when the place came from the Discover collection, so it isn't added twice */
  discoverId?: string
  source: 'map' | 'search' | 'location' | 'import' | 'discover'
  createdAt: number
  updatedAt: number
}

/** A photo taken or picked on this device, already shrunk to a sensible size */
export interface PhotoBlob {
  id: string
  blob: Blob
  w: number
  h: number
  createdAt: number
}

export const db = new Dexie('phaenti') as Dexie & {
  places: EntityTable<Place, 'id'>
  photos: EntityTable<PhotoBlob, 'id'>
}

db.version(1).stores({
  places: 'id, status, updatedAt, createdAt, name',
})
db.version(2).stores({
  places: 'id, status, category, updatedAt, createdAt, name',
}).upgrade(tx => tx.table('places').toCollection().modify((p: Place) => {
  if (!p.category) p.category = 'other'
}))
db.version(3).stores({
  places: 'id, status, category, updatedAt, createdAt, name, discoverId',
  photos: 'id, createdAt',
})

export const STATUS_COLORS: Record<PlaceStatus, string> = {
  been: '#10b981',
  planned: '#8b5cf6',
}

export const STATUS_LABELS: Record<PlaceStatus, string> = {
  been: 'Been here',
  planned: 'Want to go',
}
