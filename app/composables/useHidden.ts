// Countries hidden from Phaenti: covered on the map, removed from search,
// and blocked as places. Currently Thailand. The shape is Thailand's land
// minus Cambodia's own territory, so nothing inside Cambodia is ever hidden.

type Ring = [number, number][]
type Poly = Ring[]

export const HIDDEN_GEO_URL = '/geo/hidden-th.json'
/** Lighter outline used to remove map labels inside the hidden country */
export const HIDDEN_LABELS_URL = '/geo/hidden-th-labels.json'
export const HIDDEN_COUNTRY_CODES = ['TH']
/** Label text that marks a feature as belonging to a hidden country */
export const HIDDEN_NAME_PARTS = ['Thailand', 'ไทย', 'Siam']
const BBOX: [number, number, number, number] = [97.3, 5.6, 105.7, 20.5]

const polys = shallowRef<{ bbox: [number, number, number, number]; poly: Poly }[] | null>(null)
let loading: Promise<void> | null = null

function load() {
  loading ??= fetch(HIDDEN_GEO_URL)
    .then(r => r.json())
    .then((fc: GeoJSON.FeatureCollection) => {
      const out: { bbox: [number, number, number, number]; poly: Poly }[] = []
      for (const f of fc.features) {
        const g = f.geometry
        const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
        for (const p of list as Poly[]) {
          let w = 180, s = 90, e = -180, n = -90
          for (const [x, y] of p[0]!) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y) }
          out.push({ bbox: [w, s, e, n], poly: p })
        }
      }
      polys.value = out
    })
    .catch(() => { loading = null })
  return loading
}
if (import.meta.client) load()

function inRing(x: number, y: number, ring: Ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Is this point inside a hidden country? */
export function isHiddenPoint(lat: number, lng: number) {
  if (lng < BBOX[0] || lng > BBOX[2] || lat < BBOX[1] || lat > BBOX[3]) return false
  const list = polys.value
  if (!list) return false
  for (const { bbox, poly } of list) {
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
    if (inRing(lng, lat, poly[0]!) && !poly.slice(1).some(h => inRing(lng, lat, h))) return true
  }
  return false
}

// Words that make a search, or a search result, about Thailand. Checked against
// every Cambodian province, district, commune and village name: none match.
const BLOCKED_WORDS = [
  'thai', 'thais', 'thailand', 'siam', 'siamese', 'bangkok', 'krung thep', 'pattaya', 'phuket', 'chiang mai',
  'chiang rai', 'krabi', 'ayutthaya', 'hua hin', 'samui', 'surat thani', 'khon kaen', 'udon thani',
  'nakhon ratchasima', 'korat', 'hat yai', 'hatyai', 'songkhla', 'sukhothai', 'aranyaprathet', 'chanthaburi',
  'sa kaeo', 'ubon ratchathani', 'nong khai', 'trat', 'surin', 'buriram', 'sisaket', 'si sa ket',
  'kanchanaburi', 'nakhon phanom', 'mukdahan', 'loei', 'phitsanulok', 'lopburi', 'rayong', 'koh chang',
  'ko chang', 'koh phangan', 'ko phangan', 'koh tao', 'ko tao', 'phang nga', 'phi phi', 'khao san',
]
const BLOCKED_RE = new RegExp(`(^|[^a-z])(${BLOCKED_WORDS.map(w => w.replace(/ /g, '[\\s-]*')).join('|')})($|[^a-z])`, 'i')
/** Thai script, and the Khmer word for Thai (ថៃ). Not សៀម: it is part of Siem Reap and many Cambodian names. */
const BLOCKED_SCRIPT_RE = /[\u0E00-\u0E7F]|ថៃ/

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Is this text about Thailand? Used for search queries and result names. */
export function isBlockedText(text: string | undefined | null) {
  if (!text) return false
  return BLOCKED_SCRIPT_RE.test(text) || BLOCKED_RE.test(fold(text))
}

/** Search results: drop by country, location, or a name about Thailand. */
export function isHiddenResult(r: { lat: number; lng: number; countryCode?: string; country?: string; name?: string; subtitle?: string }) {
  if (r.countryCode && HIDDEN_COUNTRY_CODES.includes(r.countryCode.toUpperCase())) return true
  if (r.country && HIDDEN_NAME_PARTS.some(p => r.country!.includes(p))) return true
  if (isBlockedText(r.name) || isBlockedText(r.subtitle)) return true
  return isHiddenPoint(r.lat, r.lng)
}

export function useHidden() {
  return { ready: computed(() => !!polys.value), load, isHiddenPoint, isHiddenResult }
}
