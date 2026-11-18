// Free geocoding via Photon (komoot), built on OpenStreetMap data.
import { categoryFromOsm, type CategoryId } from '~/utils/categories'

export interface GeoResult {
  id: string
  name: string
  subtitle: string
  lat: number
  lng: number
  category: CategoryId
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
  return {
    id: `${p.osm_type ?? 'x'}${p.osm_id ?? i}`,
    name,
    subtitle,
    lat,
    lng,
    category: categoryFromOsm(p.osm_key, p.osm_value),
    kind: (p.osm_value ?? p.type ?? '').replace(/_/g, ' '),
  }
}

export async function searchPlaces(
  q: string,
  opts: { near?: { lat: number; lng: number }; tags?: string[]; limit?: number; signal?: AbortSignal } = {},
) {
  const url = new URL(`${BASE}/api/`)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(opts.limit ?? 8))
  if (opts.near) {
    url.searchParams.set('lat', opts.near.lat.toFixed(4))
    url.searchParams.set('lon', opts.near.lng.toFixed(4))
    url.searchParams.set('location_bias_scale', '0.3')
  }
  for (const t of opts.tags ?? []) url.searchParams.append('osm_tag', t)
  const res = await fetch(url, { signal: opts.signal })
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

/**
 * Read coordinates (and a name if present) from a pasted Google Maps URL.
 * Handles /place/<name>/@lat,lng, !3dlat!4dlng, ?q=lat,lng, ?query=lat,lng, ll=lat,lng.
 * Short links (maps.app.goo.gl, goo.gl/maps) can't be read without following the redirect.
 */
export function parseGoogleMapsUrl(text: string): { lat: number; lng: number; name: string } | 'short' | null {
  const t = text.trim()
  if (!/^https?:\/\//i.test(t) || !/google\.[a-z.]+\/maps|maps\.google\.|goo\.gl|maps\.app/i.test(t)) return null
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(t)) return 'short'
  let decoded = t
  try { decoded = decodeURIComponent(t) } catch { /* keep raw */ }
  const name = (decoded.match(/\/place\/([^/@?]+)/)?.[1] ?? '').replace(/\+/g, ' ').trim()
  const pick = (m: RegExpMatchArray | null) => (m ? { lat: Number(m[1]), lng: Number(m[2]) } : null)
  const exact = pick(decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))
  const query = pick(decoded.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/))
  const at = pick(decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))
  const c = exact ?? query ?? at
  if (!c || Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return null
  return { ...c, name }
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

export function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}
