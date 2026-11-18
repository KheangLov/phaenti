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
  address: string
  notes: string
  rating: number // 0 = unrated, 1..5
  visitedAt: string | null // YYYY-MM-DD
  tags: string[]
  source: 'map' | 'search' | 'location' | 'import'
  createdAt: number
  updatedAt: number
}

export const db = new Dexie('phaenti') as Dexie & {
  places: EntityTable<Place, 'id'>
}

db.version(1).stores({
  places: 'id, status, updatedAt, createdAt, name',
})
db.version(2).stores({
  places: 'id, status, category, updatedAt, createdAt, name',
}).upgrade(tx => tx.table('places').toCollection().modify((p: Place) => {
  if (!p.category) p.category = 'other'
}))

export const STATUS_COLORS: Record<PlaceStatus, string> = {
  been: '#10b981',
  planned: '#8b5cf6',
}

export const STATUS_LABELS: Record<PlaceStatus, string> = {
  been: 'Been here',
  planned: 'Want to go',
}
