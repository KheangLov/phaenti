<template>
  <div class="absolute inset-0">
    <div ref="el" class="h-full w-full" />
    <Transition
      enter-active-class="transition-opacity duration-500"
      leave-active-class="transition-opacity duration-700"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="!loaded" class="absolute inset-0 grid place-items-center bg-(--ui-bg-muted)">
        <div class="flex flex-col items-center gap-3 text-(--ui-text-muted)">
          <div class="size-10 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span class="text-sm">Loading map…</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { Map as MLMap, GeoJSONSource, MapMouseEvent, MapTouchEvent } from 'maplibre-gl'
import { STATUS_COLORS } from '~/utils/db'

const el = ref<HTMLElement>()
const loaded = ref(false)

const { places } = usePlaces()
const { selectedId, draft, filter, mapApi, picking, select, openDraft } = useAppState()
const colorMode = useColorMode()
const emit = defineEmits<{ moving: [boolean] }>()

let map: MLMap | null = null
let ml: typeof import('maplibre-gl') | null = null
const isDark = computed(() => colorMode.value === 'dark')
const styleUrl = () => `https://tiles.openfreemap.org/styles/${isDark.value ? 'dark' : 'liberty'}`
const EMPTY = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection

// ---------- GeoJSON builders ----------
function placesGeoJSON(): GeoJSON.FeatureCollection {
  const f = filter.value
  return {
    type: 'FeatureCollection',
    features: places.value
      .filter(p => f === 'all' || p.status === f)
      .map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, status: p.status, name: p.name },
      })),
  }
}

function pointFC(lng: number, lat: number, props: Record<string, unknown> = {}): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props }] }
}

function setData(id: string, data: GeoJSON.FeatureCollection) {
  ;(map?.getSource(id) as GeoJSONSource | undefined)?.setData(data)
}

// ---------- Layers (re-added after every style change) ----------
function addLayers() {
  if (!map || map.getSource('places')) return
  const been = STATUS_COLORS.been
  const planned = STATUS_COLORS.planned
  const label = isDark.value ? '#e4e4e7' : '#18181b'
  const halo = isDark.value ? '#09090b' : '#ffffff'

  map.addSource('places', {
    type: 'geojson',
    data: placesGeoJSON(),
    cluster: true,
    clusterRadius: 46,
    clusterMaxZoom: 13,
    clusterProperties: { been: ['+', ['case', ['==', ['get', 'status'], 'been'], 1, 0]] },
  })
  map.addSource('selected', { type: 'geojson', data: EMPTY })
  map.addSource('draft', { type: 'geojson', data: EMPTY })
  map.addSource('pulse', { type: 'geojson', data: EMPTY })
  map.addSource('me', { type: 'geojson', data: EMPTY })

  // Clusters: colour shows the mix of been vs planned
  map.addLayer({
    id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['interpolate', ['linear'], ['/', ['get', 'been'], ['get', 'point_count']], 0, planned, 1, been],
      'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 50, 26, 200, 32],
      'circle-stroke-width': 5,
      'circle-stroke-color': isDark.value ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)',
      'circle-opacity': 0.95,
    },
  })
  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })

  // Single places: white halo + coloured core
  map.addLayer({
    id: 'points-halo', type: 'circle', source: 'places', filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 10, 8, 16, 12],
      'circle-color': '#ffffff',
      'circle-blur': 0.15,
    },
  })
  map.addLayer({
    id: 'points', type: 'circle', source: 'places', filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.2, 10, 5.5, 16, 8.5],
      'circle-color': ['match', ['get', 'status'], 'been', been, planned],
    },
  })
  map.addLayer({
    id: 'points-label', type: 'symbol', source: 'places', filter: ['!', ['has', 'point_count']], minzoom: 11.5,
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
      'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9,
    },
    paint: { 'text-color': label, 'text-halo-color': halo, 'text-halo-width': 1.6 },
  })

  // Selection ring
  map.addLayer({
    id: 'selected-ring', type: 'circle', source: 'selected',
    paint: {
      'circle-radius': 19,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.18,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': ['get', 'color'],
    },
  })

  // Draft (unsaved) pin
  map.addLayer({
    id: 'draft-ring', type: 'circle', source: 'draft',
    paint: { 'circle-radius': 14, 'circle-color': isDark.value ? '#fafafa' : '#18181b', 'circle-opacity': 0.14 },
  })
  map.addLayer({
    id: 'draft-dot', type: 'circle', source: 'draft',
    paint: { 'circle-radius': 7, 'circle-color': isDark.value ? '#fafafa' : '#18181b', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
  })

  // Pulse ring for newly added places (animated on the GPU via paint props)
  map.addLayer({
    id: 'pulse', type: 'circle', source: 'pulse',
    paint: { 'circle-radius': 0, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0 },
  })

  // My location
  map.addLayer({
    id: 'me-halo', type: 'circle', source: 'me',
    paint: { 'circle-radius': 22, 'circle-color': '#3b82f6', 'circle-opacity': 0.16 },
  })
  map.addLayer({
    id: 'me-dot', type: 'circle', source: 'me',
    paint: { 'circle-radius': 7, 'circle-color': '#3b82f6', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
  })

  syncSelected()
  syncDraft()
  if (lastMe) setData('me', pointFC(lastMe.lng, lastMe.lat))
}

// ---------- Sync state -> map ----------
function syncSelected() {
  const p = places.value.find(x => x.id === selectedId.value)
  setData('selected', p ? pointFC(p.lng, p.lat, { color: STATUS_COLORS[p.status] }) : EMPTY)
}
function syncDraft() {
  const d = draft.value
  setData('draft', d ? pointFC(d.lng, d.lat) : EMPTY)
}

let rafSync = 0
watch([places, filter], () => {
  cancelAnimationFrame(rafSync)
  rafSync = requestAnimationFrame(() => {
    setData('places', placesGeoJSON())
    syncSelected()
  })
})
watch(selectedId, syncSelected)
watch(draft, syncDraft, { deep: true })
watch(isDark, () => map?.setStyle(styleUrl()))

// ---------- Camera helpers ----------
function sheetPadding() {
  const h = window.innerHeight
  return { top: 80, bottom: Math.round(h * 0.45), left: 24, right: 24 }
}

function flyTo(lng: number, lat: number, zoom?: number) {
  if (!map) return
  const z = zoom ?? Math.max(map.getZoom(), 14)
  map.flyTo({ center: [lng, lat], zoom: z, padding: sheetPadding(), speed: 1.3, curve: 1.45, essential: false })
}

function fitAll() {
  if (!map || !ml || !places.value.length) return
  const b = new ml.LngLatBounds()
  places.value.forEach(p => b.extend([p.lng, p.lat]))
  map.fitBounds(b, { padding: { top: 100, bottom: Math.round(window.innerHeight * 0.3), left: 48, right: 48 }, maxZoom: 13, duration: 1200 })
}

let lastMe: { lng: number; lat: number } | null = null
function locate() {
  return new Promise<{ lng: number; lat: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastMe = { lng: pos.coords.longitude, lat: pos.coords.latitude }
        setData('me', pointFC(lastMe.lng, lastMe.lat))
        flyTo(lastMe.lng, lastMe.lat, 15)
        resolve(lastMe)
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  })
}

function pulse(lng: number, lat: number, color: string) {
  if (!map) return
  setData('pulse', pointFC(lng, lat, { color }))
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const start = performance.now()
  const dur = 1100
  const step = (t: number) => {
    if (!map) return
    const k = Math.min(1, (t - start) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    map.setPaintProperty('pulse', 'circle-radius', 8 + e * 46)
    map.setPaintProperty('pulse', 'circle-stroke-opacity', (1 - k) * 0.9)
    if (k < 1) requestAnimationFrame(step)
    else setData('pulse', EMPTY)
  }
  requestAnimationFrame(step)
}

// ---------- Init ----------
const CAMERA_KEY = 'phaenti:camera'
function savedCamera() {
  try { return JSON.parse(localStorage.getItem(CAMERA_KEY) || 'null') } catch { return null }
}

onMounted(async () => {
  const [mod, worker] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ])
  mod.setWorkerUrl(worker.default)
  ml = mod
  const cam = savedCamera()
  map = new mod.Map({
    container: el.value!,
    style: styleUrl(),
    center: cam?.center ?? [105, 15],
    zoom: cam?.zoom ?? 2.2,
    attributionControl: false,
    fadeDuration: 180,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    renderWorldCopies: true,
    cancelPendingTileRequestsWhileZooming: true,
  })
  map.touchZoomRotate.disableRotation()
  map.addControl(new mod.AttributionControl({ compact: true }), 'top-left')

  map.on('style.load', addLayers)
  map.once('idle', () => {
    loaded.value = true
    if (!cam && places.value.length) fitAll()
  })
  // Don't block forever if tiles are offline
  setTimeout(() => (loaded.value = true), 6000)

  map.on('movestart', () => emit('moving', true))
  map.on('moveend', () => {
    emit('moving', false)
    try {
      const c = map!.getCenter()
      localStorage.setItem(CAMERA_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map!.getZoom() }))
    } catch { /* storage unavailable */ }
  })

  // Tap: clusters zoom in, points select, empty map clears
  map.on('click', async (e: MapMouseEvent) => {
    if (picking.value || !map || !map.getLayer('points')) return
    const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'points', 'points-halo'] })
    const cluster = hits.find(h => h.layer.id === 'clusters')
    if (cluster) {
      const src = map.getSource('places') as GeoJSONSource
      const zoom = await src.getClusterExpansionZoom(cluster.properties.cluster_id)
      map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3, duration: 650 })
      return
    }
    const point = hits.find(h => h.layer.id === 'points' || h.layer.id === 'points-halo')
    if (point) {
      select(point.properties.id)
      const p = places.value.find(x => x.id === point.properties.id)
      if (p) flyTo(p.lng, p.lat)
      return
    }
    if (selectedId.value || draft.value) select(null)
  })

  // Hover cursor on desktop
  for (const id of ['clusters', 'points', 'points-halo']) {
    map.on('mouseenter', id, () => (map!.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => (map!.getCanvas().style.cursor = ''))
  }

  // Long-press (touch) or right-click (desktop) drops a draft pin
  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let pressStart: { x: number; y: number } | null = null
  const dropAt = (lng: number, lat: number) => {
    if (navigator.vibrate) navigator.vibrate(12)
    startDraft(lng, lat, 'map')
  }
  map.on('touchstart', (e: MapTouchEvent) => {
    clearTimeout(pressTimer)
    if (e.originalEvent.touches.length !== 1 || picking.value) return
    pressStart = { x: e.point.x, y: e.point.y }
    const { lng, lat } = e.lngLat
    pressTimer = setTimeout(() => dropAt(lng, lat), 520)
  })
  map.on('touchmove', (e: MapTouchEvent) => {
    if (pressStart && Math.hypot(e.point.x - pressStart.x, e.point.y - pressStart.y) > 8) clearTimeout(pressTimer)
  })
  map.on('touchend', () => clearTimeout(pressTimer))
  map.on('touchcancel', () => clearTimeout(pressTimer))
  map.on('movestart', () => clearTimeout(pressTimer))
  map.on('contextmenu', (e: MapMouseEvent) => {
    if (!('ontouchstart' in window)) dropAt(e.lngLat.lng, e.lngLat.lat)
  })

  mapApi.value = {
    flyTo,
    fitAll,
    locate,
    pulse,
    center: () => {
      const c = map!.getCenter()
      return { lng: c.lng, lat: c.lat }
    },
  }
})

let geoAbort: AbortController | null = null
async function startDraft(lng: number, lat: number, source: 'map' | 'location') {
  openDraft({ name: 'Dropped pin', address: formatCoords(lat, lng), lat, lng, source, loading: true })
  flyTo(lng, lat)
  geoAbort?.abort()
  geoAbort = new AbortController()
  const r = await reverseGeocode(lat, lng, geoAbort.signal)
  if (draft.value && draft.value.lat === lat && draft.value.lng === lng) {
    draft.value = { ...draft.value, name: r?.name ?? 'Dropped pin', address: r?.subtitle || formatCoords(lat, lng), loading: false }
  }
}
defineExpose({ startDraft })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  mapApi.value = null
})
</script>
