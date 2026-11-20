export type PersonalId = 'home' | 'office' | 'family' | 'friend'
export type CategoryId =
  | 'food' | 'cafe' | 'nightlife' | 'temple' | 'nature' | 'beach'
  | 'viewpoint' | 'stay' | 'shopping' | 'culture' | 'transport' | 'other'
  | PersonalId

export interface Category {
  id: CategoryId
  label: string
  km: string
  icon: string // lucide name (UI uses i-lucide-<icon>)
  color: string
  color2: string // gradient end
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', km: 'អាហារ', icon: 'utensils', color: '#f97316', color2: '#ea580c' },
  { id: 'cafe', label: 'Café', km: 'កាហ្វេ', icon: 'coffee', color: '#c2410c', color2: '#92400e' },
  { id: 'nightlife', label: 'Nightlife', km: 'កម្សាន្តយប់', icon: 'wine', color: '#db2777', color2: '#9d174d' },
  { id: 'temple', label: 'Temple', km: 'វត្ត', icon: 'landmark', color: '#d97706', color2: '#b45309' },
  { id: 'nature', label: 'Nature', km: 'ធម្មជាតិ', icon: 'trees', color: '#16a34a', color2: '#15803d' },
  { id: 'beach', label: 'Beach', km: 'ឆ្នេរ', icon: 'umbrella', color: '#0891b2', color2: '#0e7490' },
  { id: 'viewpoint', label: 'Viewpoint', km: 'ទេសភាព', icon: 'mountain', color: '#475569', color2: '#334155' },
  { id: 'stay', label: 'Stay', km: 'ស្នាក់នៅ', icon: 'bed-double', color: '#4f46e5', color2: '#4338ca' },
  { id: 'shopping', label: 'Shopping', km: 'ទិញឥវ៉ាន់', icon: 'shopping-bag', color: '#e11d48', color2: '#be123c' },
  { id: 'culture', label: 'Culture', km: 'វប្បធម៌', icon: 'palette', color: '#7c3aed', color2: '#6d28d9' },
  { id: 'transport', label: 'Transport', km: 'ដឹកជញ្ជូន', icon: 'plane', color: '#0284c7', color2: '#0369a1' },
  { id: 'other', label: 'Other', km: 'ផ្សេងៗ', icon: 'map-pin', color: '#52525b', color2: '#3f3f46' },
]

/** Your own places: homes, offices, family and friends. Not "been / want to go" spots. */
export const PERSONAL: Category[] = [
  { id: 'home', label: 'Home', km: 'ផ្ទះ', icon: 'house', color: '#2563eb', color2: '#1d4ed8' },
  { id: 'office', label: 'Office', km: 'ការិយាល័យ', icon: 'briefcase-business', color: '#0f766e', color2: '#115e59' },
  { id: 'family', label: 'Family', km: 'គ្រួសារ', icon: 'users-round', color: '#e11d48', color2: '#be123c' },
  { id: 'friend', label: 'Friend', km: 'មិត្តភក្តិ', icon: 'heart-handshake', color: '#d97706', color2: '#b45309' },
]
export const ALL_CATEGORIES = [...CATEGORIES, ...PERSONAL]
export const isPersonal = (id: string | undefined | null): id is PersonalId => !!id && PERSONAL.some(p => p.id === id)

export const CATEGORY_MAP = Object.fromEntries(ALL_CATEGORIES.map(c => [c.id, c])) as Record<CategoryId, Category>

export function categoryOf(id: string | undefined | null): Category {
  return CATEGORY_MAP[(id ?? 'other') as CategoryId] ?? CATEGORY_MAP.other
}

/** Guess a category from OpenStreetMap tags (as returned by Photon). */
export function categoryFromOsm(key = '', value = ''): CategoryId {
  const v = value.toLowerCase()
  const k = key.toLowerCase()
  if (['restaurant', 'fast_food', 'food_court', 'bbq', 'ice_cream', 'bakery', 'deli'].includes(v)) return 'food'
  if (['cafe', 'coffee', 'tea'].includes(v)) return 'cafe'
  if (['bar', 'pub', 'nightclub', 'biergarten', 'karaoke_box', 'casino'].includes(v)) return 'nightlife'
  if (['place_of_worship', 'monastery', 'temple', 'shrine', 'buddhist', 'stupa', 'wayside_shrine'].includes(v)) return 'temple'
  if (['beach', 'bay', 'coastline', 'island', 'islet'].includes(v)) return 'beach'
  if (['viewpoint', 'peak', 'volcano', 'ridge', 'cliff', 'hill'].includes(v)) return 'viewpoint'
  if (['park', 'nature_reserve', 'national_park', 'garden', 'wood', 'forest', 'waterfall', 'water', 'lake', 'river', 'protected_area', 'camp_site'].includes(v)) return 'nature'
  if (['hotel', 'hostel', 'guest_house', 'motel', 'resort', 'apartment', 'chalet'].includes(v)) return 'stay'
  if (k === 'shop' || ['marketplace', 'mall', 'market', 'supermarket', 'department_store'].includes(v)) return 'shopping'
  if (['museum', 'gallery', 'artwork', 'theatre', 'arts_centre', 'attraction', 'monument', 'memorial', 'ruins', 'archaeological_site', 'castle', 'cinema', 'zoo', 'theme_park', 'aquarium'].includes(v)) return 'culture'
  if (['aerodrome', 'airport', 'bus_station', 'station', 'ferry_terminal', 'terminal', 'pier'].includes(v)) return 'transport'
  if (k === 'historic') return 'culture'
  if (k === 'natural' || k === 'leisure') return 'nature'
  return 'other'
}

/** Nearby-search shortcuts (Photon q + osm_tag filters) */
export interface QuickSearch {
  /** Category given to a place saved from these results */
  id: CategoryId
  /** Unique key when several chips share a category (ATM, fuel…) */
  key?: string
  label: string
  q: string
  tags: string[]
  icon?: string
  color?: string
  color2?: string
}
export const QUICK_SEARCHES: QuickSearch[] = [
  { id: 'food', label: 'Food', q: 'restaurant', tags: ['amenity:restaurant', 'amenity:fast_food'] },
  { id: 'cafe', label: 'Cafés', q: 'cafe', tags: ['amenity:cafe'] },
  { id: 'transport', key: 'fuel', label: 'Gas', q: 'fuel', tags: ['amenity:fuel'], icon: 'fuel', color: '#0ea5e9', color2: '#0369a1' },
  { id: 'other', key: 'atm', label: 'ATMs', q: 'atm', tags: ['amenity:atm', 'amenity:bank'], icon: 'banknote', color: '#16a34a', color2: '#15803d' },
  { id: 'temple', label: 'Temples', q: 'wat', tags: ['amenity:place_of_worship', 'historic'] },
  { id: 'nature', label: 'Nature', q: 'park', tags: ['leisure:park', 'natural', 'waterway:waterfall', 'boundary:national_park'] },
  { id: 'beach', label: 'Beaches', q: 'beach', tags: ['natural:beach'] },
  { id: 'stay', label: 'Hotels', q: 'hotel', tags: ['tourism:hotel', 'tourism:guest_house', 'tourism:hostel', 'tourism:resort'] },
  { id: 'nightlife', label: 'Nightlife', q: 'bar', tags: ['amenity:bar', 'amenity:pub', 'amenity:nightclub'] },
  { id: 'shopping', label: 'Markets', q: 'market', tags: ['amenity:marketplace', 'shop:mall', 'shop:supermarket'] },
  { id: 'viewpoint', label: 'Viewpoints', q: 'viewpoint', tags: ['tourism:viewpoint', 'natural:peak'] },
  { id: 'culture', label: 'Museums', q: 'museum', tags: ['tourism:museum', 'tourism:attraction', 'historic'] },
  { id: 'other', key: 'pharmacy', label: 'Pharmacies', q: 'pharmacy', tags: ['amenity:pharmacy'], icon: 'pill', color: '#ec4899', color2: '#be185d' },
  { id: 'other', key: 'hospital', label: 'Hospitals', q: 'hospital', tags: ['amenity:hospital', 'amenity:clinic'], icon: 'hospital', color: '#ef4444', color2: '#b91c1c' },
]
export const quickKey = (c: QuickSearch) => c.key ?? c.id

/** List / map filter: all, been, want to go (travel spots only), or one personal type. */
export function matchesFilter(p: { status: string; category: string }, f: string) {
  if (f === 'all') return true
  if (isPersonal(f)) return p.category === f
  return p.status === f && !isPersonal(p.category)
}
