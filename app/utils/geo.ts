// Small geometry helpers (no dependencies).

export type LngLat = [number, number]

const R = 6371.0088 // km

export function haversineKm(a: LngLat, b: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function pathKm(points: LngLat[]) {
  let d = 0
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1]!, points[i]!)
  return d
}

/** Area of a polygon on the sphere, km² (ring need not be closed). */
export function areaKm2(ring: LngLat[]) {
  if (ring.length < 3) return 0
  const toRad = (d: number) => (d * Math.PI) / 180
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!
    const [x2, y2] = ring[(i + 1) % ring.length]!
    total += toRad(x2 - x1) * (2 + Math.sin(toRad(y1)) + Math.sin(toRad(y2)))
  }
  return Math.abs((total * R * R) / 2)
}

/** Decode an encoded polyline (precision 5 for Google/OSRM, 6 for Valhalla) to [lng, lat]. */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = 10 ** precision
  const out: LngLat[] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0
      let shift = 0
      let b: number
      do {
        b = str.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lng += delta
    }
    out.push([lng / factor, lat / factor])
  }
  return out
}

export function formatKm(km: number, khmer = false) {
  const unitM = khmer ? 'ម៉ែត្រ' : 'm'
  const unitKm = khmer ? 'គ.ម' : 'km'
  if (km < 1) return `${Math.round(km * 1000)} ${unitM}`
  if (km < 10) return `${km.toFixed(2)} ${unitKm}`
  if (km < 100) return `${km.toFixed(1)} ${unitKm}`
  return `${Math.round(km).toLocaleString()} ${unitKm}`
}

export function formatArea(km2: number, khmer = false) {
  if (km2 < 0.01) return `${Math.round(km2 * 1e6).toLocaleString()} ${khmer ? 'ម៉ែត្រការ៉េ' : 'm²'}`
  if (km2 < 1) return `${(km2 * 100).toFixed(2)} ${khmer ? 'ហិកតា' : 'ha'}`
  return `${km2 < 100 ? km2.toFixed(2) : Math.round(km2).toLocaleString()} ${khmer ? 'គ.ម²' : 'km²'}`
}

export function formatDuration(seconds: number, khmer = false) {
  const m = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (khmer) return h ? `${h} ម៉ោង ${mm ? `${mm} នាទី` : ''}`.trim() : `${m} នាទី`
  return h ? `${h} h ${mm ? `${mm} min` : ''}`.trim() : `${m} min`
}
