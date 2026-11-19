// Free routing on OpenStreetMap data.
// Primary: Valhalla on the FOSSGIS community server (car, motorbike, bike, walk),
// told to avoid Thailand. Fallback: OSRM on the same community (car, bike, foot).
// Both are volunteer-run: at most one request per second, no guaranteed uptime.
import { decodePolyline, type LngLat } from '~/utils/geo'
import { isHiddenPoint } from '~/composables/useHidden'

export type TravelMode = 'car' | 'moto' | 'bike' | 'walk'

export interface RouteStep {
  type: number // Valhalla maneuver type (OSRM steps are mapped onto it)
  text: string // English instruction from the router
  street: string
  km: number
  seconds: number
  at: LngLat
}

export interface RouteResult {
  coords: LngLat[]
  km: number
  seconds: number
  steps: RouteStep[]
  provider: 'valhalla' | 'osrm'
}

export class RouteError extends Error {
  constructor(public code: 'offline' | 'noroute' | 'busy' | 'hidden', msg?: string) {
    super(msg ?? code)
  }
}

const VALHALLA = 'https://valhalla1.openstreetmap.de/route'
const OSRM = 'https://routing.openstreetmap.de'
const COSTING: Record<TravelMode, string> = { car: 'auto', moto: 'motor_scooter', bike: 'bicycle', walk: 'pedestrian' }
const OSRM_PROFILE: Record<TravelMode, string> = { car: 'routed-car', moto: 'routed-car', bike: 'routed-bike', walk: 'routed-foot' }

let avoid: LngLat[][] | null = null
async function avoidRings() {
  if (!avoid) {
    try { avoid = await (await fetch('/geo/route-avoid-th.json')).json() } catch { avoid = [] }
  }
  return avoid!
}

// Respect the community servers: never more than one request per second
let last = 0
async function throttle() {
  const wait = last + 1100 - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  last = Date.now()
}

function crossesHidden(coords: LngLat[]) {
  const step = Math.max(1, Math.floor(coords.length / 400))
  for (let i = 0; i < coords.length; i += step) if (isHiddenPoint(coords[i]![1], coords[i]![0])) return true
  return false
}

async function valhalla(from: LngLat, to: LngLat, mode: TravelMode, signal?: AbortSignal): Promise<RouteResult> {
  const body = {
    locations: [{ lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] }],
    costing: COSTING[mode],
    directions_options: { units: 'kilometers', language: 'en-US' },
    exclude_polygons: await avoidRings(),
  }
  await throttle()
  // No custom headers: a "simple" CORS request, so no preflight is needed
  const res = await fetch(VALHALLA, { method: 'POST', body: JSON.stringify(body), signal })
  if (res.status === 429) throw new RouteError('busy')
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.trip) throw new RouteError('noroute', json?.error)
  const leg = json.trip.legs[0]
  const coords = decodePolyline(leg.shape, 6)
  const steps: RouteStep[] = (leg.maneuvers ?? []).map((m: any) => ({
    type: m.type ?? 0,
    text: m.instruction ?? '',
    street: (m.street_names ?? [])[0] ?? '',
    km: m.length ?? 0,
    seconds: m.time ?? 0,
    at: coords[m.begin_shape_index ?? 0] ?? coords[0]!,
  }))
  return { coords, km: json.trip.summary.length, seconds: json.trip.summary.time, steps, provider: 'valhalla' }
}

// OSRM maneuver → Valhalla-style type, so the UI has one set of icons/texts
function osrmType(m: any): number {
  const mod: string = m.modifier ?? ''
  switch (m.type) {
    case 'depart': return 1
    case 'arrive': return 4
    case 'roundabout': case 'rotary': return 26
    case 'exit roundabout': case 'exit rotary': return 27
    case 'merge': return 25
    case 'fork': return mod.includes('left') ? 24 : mod.includes('right') ? 23 : 22
    default:
      if (mod === 'uturn') return 13
      if (mod === 'sharp right') return 11
      if (mod === 'right') return 10
      if (mod === 'slight right') return 9
      if (mod === 'sharp left') return 14
      if (mod === 'left') return 15
      if (mod === 'slight left') return 16
      return 8
  }
}

async function osrm(from: LngLat, to: LngLat, mode: TravelMode, signal?: AbortSignal): Promise<RouteResult> {
  await throttle()
  const url = `${OSRM}/${OSRM_PROFILE[mode]}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=polyline6&steps=true&alternatives=2`
  const res = await fetch(url, { signal })
  if (res.status === 429) throw new RouteError('busy')
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.code !== 'Ok' || !json.routes?.length) throw new RouteError('noroute')
  // Prefer an alternative that stays out of Thailand
  const routes = json.routes.map((r: any) => ({ r, coords: decodePolyline(r.geometry, 6) }))
  const pick = routes.find((x: any) => !crossesHidden(x.coords))
  if (!pick) throw new RouteError('hidden')
  const steps: RouteStep[] = pick.r.legs[0].steps.map((s: any) => ({
    type: osrmType(s.maneuver),
    text: '',
    street: s.name ?? '',
    km: s.distance / 1000,
    seconds: s.duration,
    at: s.maneuver.location as LngLat,
  }))
  return { coords: pick.coords, km: pick.r.distance / 1000, seconds: pick.r.duration, steps, provider: 'osrm' }
}

export async function findRoute(from: LngLat, to: LngLat, mode: TravelMode, signal?: AbortSignal): Promise<RouteResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new RouteError('offline')
  try {
    const r = await valhalla(from, to, mode, signal)
    if (crossesHidden(r.coords)) throw new RouteError('hidden')
    return r
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    if (e instanceof RouteError && e.code === 'hidden') throw e
    // Valhalla down, busy or blocked: try OSRM
    try {
      return await osrm(from, to, mode, signal)
    } catch (e2: any) {
      if (e2?.name === 'AbortError') throw e2
      if (e2 instanceof RouteError) throw e2
      throw new RouteError(navigator.onLine ? 'noroute' : 'offline')
    }
  }
}

/** Open the same trip in Google Maps for live turn-by-turn navigation. */
export function googleDirectionsUrl(from: LngLat | null, to: LngLat, mode: TravelMode) {
  const travelmode = { car: 'driving', moto: 'two-wheeler', bike: 'bicycling', walk: 'walking' }[mode]
  const origin = from ? `&origin=${from[1]},${from[0]}` : ''
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${to[1]},${to[0]}&travelmode=${travelmode}`
}
