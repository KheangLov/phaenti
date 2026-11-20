// "Street View" for any spot: the nearest Mapillary street photo in the app when there is
// one (free key), otherwise Google Street View in Google Maps.
import { haversineKm } from '~/utils/geo'
import { googleStreetViewUrl } from '~/composables/useKeys'

export async function nearestStreetImage(lat: number, lng: number, token: string, radiusM = 250): Promise<{ id: string; lat: number; lng: number } | null> {
  const d = radiusM / 111_000
  const dl = d / Math.cos((lat * Math.PI) / 180)
  const q = new URLSearchParams({
    access_token: token,
    fields: 'id,computed_geometry,geometry',
    bbox: [lng - dl, lat - d, lng + dl, lat + d].map(v => v.toFixed(6)).join(','),
    limit: '50',
  })
  const res = await fetch(`https://graph.mapillary.com/images?${q}`)
  if (!res.ok) throw new Error(String(res.status))
  const json = await res.json()
  let best: { id: string; lat: number; lng: number; km: number } | null = null
  for (const im of json.data ?? []) {
    const c = (im.computed_geometry ?? im.geometry)?.coordinates
    if (!c) continue
    const km = haversineKm([lng, lat], [c[0], c[1]])
    if (!best || km < best.km) best = { id: String(im.id), lat: c[1], lng: c[0], km }
  }
  return best && best.km * 1000 <= radiusM ? { id: best.id, lat: best.lat, lng: best.lng } : null
}

export function useStreet() {
  const { mapillary } = useKeys()
  const { streetView } = useAppState()
  const busy = ref(false)

  /** Opens street-level photos at this spot; returns where they were shown */
  async function openAt(lat: number, lng: number): Promise<'app' | 'google'> {
    if (mapillary.value) {
      busy.value = true
      try {
        const hit = await nearestStreetImage(lat, lng, mapillary.value)
        if (hit) {
          streetView.value = { imageId: hit.id, lat: hit.lat, lng: hit.lng }
          return 'app'
        }
      } catch { /* fall back to Google */ } finally {
        busy.value = false
      }
    }
    window.open(googleStreetViewUrl(lat, lng), '_blank', 'noopener')
    return 'google'
  }
  return { openAt, busy }
}
