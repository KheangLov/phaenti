import Dexie, { type EntityTable } from 'dexie'

export type PlaceStatus = 'been' | 'planned'

export interface Place {
  id: string
  name: string
  lat: number
  lng: number
  status: PlaceStatus
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

export const STATUS_COLORS: Record<PlaceStatus, string> = {
  been: '#10b981',
  planned: '#8b5cf6',
}

export const STATUS_LABELS: Record<PlaceStatus, string> = {
  been: 'Been here',
  planned: 'Want to go',
}
