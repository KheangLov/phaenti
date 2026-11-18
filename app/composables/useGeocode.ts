// Free geocoding via Photon (komoot), built on OpenStreetMap data.

export interface GeoResult {
  id: string
  name: string
  subtitle: string
  lat: number
  lng: number
  kind: string
}

const BASE = 'https://photon.komoot.io'

function format(f: any, i: number): GeoResult {
  const p = f.properties ?? {}
  const [lng, lat] = f.geometry.coordinates
  const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : ''
  const name = p.name || street || p.city || p.county || p.state || p.country || 'Unnamed place'
  const parts = [street !== name ? street : '', p.district, p.city !== name ? p.city : '', p.state !== name ? p.state : '', p.country !== name ? p.country : '']
  const subtitle = [...new Set(parts.filter(Boolean))].join(', ')
  return { id: `${p.osm_type ?? 'x'}${p.osm_id ?? i}`, name, subtitle, lat, lng, kind: p.osm_value ?? p.type ?? '' }
}

export async function searchPlaces(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal) {
  const url = new URL(`${BASE}/api/`)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '7')
  if (near) {
    url.searchParams.set('lat', near.lat.toFixed(4))
    url.searchParams.set('lon', near.lng.toFixed(4))
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = await res.json()
  return (json.features ?? []).map(format) as GeoResult[]
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal) {
  try {
    const url = new URL(`${BASE}/reverse`)
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const f = (await res.json()).features?.[0]
    return f ? format(f, 0) : null
  } catch {
    return null
  }
}

/** "11.5564, 104.9282" or "11.5564 104.9282" */
export function parseCoordinates(q: string) {
  const m = q.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

export function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
