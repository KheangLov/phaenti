<template>
  <div class="absolute inset-0">
    <div ref="el" class="h-full w-full" />
    <Transition
      enter-active-class="transition-opacity duration-500"
      leave-active-class="transition-opacity duration-700"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="!loaded" class="pointer-events-none absolute inset-0 grid place-items-center bg-(--ui-bg-muted)">
        <div class="flex flex-col items-center gap-3 text-(--ui-text-muted)">
          <div class="size-10 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span class="text-sm">Loading map…</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { Map as MLMap, GeoJSONSource, MapMouseEvent, MapTouchEvent, ExpressionSpecification } from 'maplibre-gl'
import { STATUS_COLORS } from '~/utils/db'
import { categoryOf, type CategoryId } from '~/utils/categories'
import { ensurePinImages } from '~/utils/pins'
import { adminCounts } from '~/composables/useAdmin'

const el = ref<HTMLElement>()
const loaded = ref(false)

const { places } = usePlaces()
const { selectedId, draft, area, filter, mapApi, picking, showBoundaries, showExplored, select, openDraft, openArea } = useAppState()
const colorMode = useColorMode()
const emit = defineEmits<{ moving: [boolean] }>()

let map: MLMap | null = null
let ml: typeof import('maplibre-gl') | null = null
const isDark = computed(() => colorMode.value === 'dark')
const styleUrl = () => `https://tiles.openfreemap.org/styles/${isDark.value ? 'dark' : 'liberty'}`
const EMPTY = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection
const LEVELS = ['province', 'district', 'commune'] as const
type Level = typeof LEVELS[number]
const levelOfCode = (code: string): Level => (code.length === 2 ? 'province' : code.length === 4 ? 'district' : 'commune')
const ZOOM_SPLIT = { district: 7.5, commune: 9.5 }

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
        properties: { id: p.id, status: p.status, category: p.category ?? 'other', name: p.name, lat: p.lat },
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
let layersReady = false
async function addLayers() {
  if (!map || map.getSource('places')) return
  layersReady = false
  await ensurePinImages(map)
  if (!map || map.getSource('places')) return
  addAdminLayers()
  addPlaceLayers()
  layersReady = true
  syncSelected()
  syncDraft()
  syncExplored(true)
  syncArea()
  syncVisibility()
  if (lastMe) setData('me', pointFC(lastMe.lng, lastMe.lat))
}

function addAdminLayers() {
  if (!map) return
  const dark = isDark.value
  const line = dark ? '#cbd5e1' : '#1e293b'
  const accent = '#10b981'
  const firstLabel = map.getStyle().layers.find(l => l.type === 'symbol')?.id

  map.addSource('admin', {
    type: 'vector',
    tiles: [`${location.origin}/admin/tiles/{z}/{x}/{y}.pbf`],
    minzoom: 4,
    maxzoom: 11,
    bounds: [102.2, 10.3, 107.7, 14.8],
    promoteId: 'code',
    attribution: 'Boundaries: Open Development Cambodia (CC BY 4.0), names: Pumi',
  })

  const n: ExpressionSpecification = ['coalesce', ['feature-state', 'n'], 0]
  const ranges: Record<Level, [number, number]> = {
    province: [0, ZOOM_SPLIT.district],
    district: [ZOOM_SPLIT.district, ZOOM_SPLIT.commune],
    commune: [ZOOM_SPLIT.commune, 24],
  }

  for (const lvl of LEVELS) {
    const [minzoom, maxzoom] = ranges[lvl]
    // "Explored" tint: areas where you've been glow green, stronger with more places
    map.addLayer({
      id: `explored-${lvl}`, type: 'fill', source: 'admin', 'source-layer': lvl, minzoom, maxzoom,
      paint: {
        'fill-color': accent,
        'fill-opacity': ['interpolate', ['linear'], n, 0, 0, 1, dark ? 0.2 : 0.14, 4, dark ? 0.3 : 0.22, 12, dark ? 0.42 : 0.32],
        'fill-opacity-transition': { duration: 600 },
      },
    }, firstLabel)
    // Hit + selection fill (transparent unless selected)
    map.addLayer({
      id: `sel-fill-${lvl}`, type: 'fill', source: 'admin', 'source-layer': lvl,
      minzoom: lvl === 'province' ? 0 : lvl === 'district' ? 6 : 8,
      paint: {
        'fill-color': dark ? '#a78bfa' : '#7c3aed',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 0.12, 0],
      },
    }, firstLabel)
  }

  // Boundary lines: provinces strong, districts dashed, communes dotted
  map.addLayer({
    id: 'line-commune', type: 'line', source: 'admin', 'source-layer': 'commune', minzoom: 9,
    paint: {
      'line-color': line,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.28, 13, 0.4],
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1.2],
      'line-dasharray': [1, 2],
    },
  }, firstLabel)
  map.addLayer({
    id: 'line-district', type: 'line', source: 'admin', 'source-layer': 'district', minzoom: 7,
    paint: {
      'line-color': line,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.4, 12, 0.55],
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 12, 1.6],
      'line-dasharray': [3, 2],
    },
  }, firstLabel)
  map.addLayer({
    id: 'line-province-glow', type: 'line', source: 'admin', 'source-layer': 'province',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': dark ? '#0f172a' : '#ffffff',
      'line-opacity': 0.7,
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 5],
    },
  }, firstLabel)
  map.addLayer({
    id: 'line-province', type: 'line', source: 'admin', 'source-layer': 'province',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': line,
      'line-opacity': 0.65,
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 10, 2.2],
    },
  }, firstLabel)

  // Selected area outline
  for (const lvl of LEVELS) {
    map.addLayer({
      id: `sel-line-${lvl}`, type: 'line', source: 'admin', 'source-layer': lvl,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': dark ? '#c4b5fd' : '#7c3aed',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 3.5],
        'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0],
      },
    })
  }

  // Area labels (English; Khmer names show in the panel — map text can't shape Khmer)
  const halo = dark ? 'rgba(9,9,11,0.85)' : 'rgba(255,255,255,0.9)'
  map.addLayer({
    id: 'label-province', type: 'symbol', source: 'admin', 'source-layer': 'label_province', minzoom: 5, maxzoom: 8.5,
    layout: {
      'text-field': ['upcase', ['get', 'name']], 'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9.5, 8, 13], 'text-letter-spacing': 0.14, 'text-max-width': 7,
    },
    paint: { 'text-color': dark ? '#e2e8f0' : '#334155', 'text-halo-color': halo, 'text-halo-width': 1.4, 'text-opacity': 0.85 },
  })
  map.addLayer({
    id: 'label-district', type: 'symbol', source: 'admin', 'source-layer': 'label_district', minzoom: 8.3, maxzoom: 11,
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11.5, 'text-max-width': 8,
      'symbol-sort-key': ['-', ['get', 'area']],
    },
    paint: { 'text-color': dark ? '#cbd5e1' : '#475569', 'text-halo-color': halo, 'text-halo-width': 1.3 },
  })
  map.addLayer({
    id: 'label-commune', type: 'symbol', source: 'admin', 'source-layer': 'label_commune', minzoom: 10.6, maxzoom: 13.5,
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 10.5, 'text-max-width': 8,
      'symbol-sort-key': ['-', ['get', 'area']],
    },
    paint: { 'text-color': dark ? '#a1a1aa' : '#64748b', 'text-halo-color': halo, 'text-halo-width': 1.2 },
  })
}

function addPlaceLayers() {
  if (!map) return
  const been = STATUS_COLORS.been
  const planned = STATUS_COLORS.planned
  const label = isDark.value ? '#f4f4f5' : '#18181b'
  const halo = isDark.value ? '#09090b' : '#ffffff'

  map.addSource('places', {
    type: 'geojson',
    data: placesGeoJSON(),
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 12,
    clusterProperties: { been: ['+', ['case', ['==', ['get', 'status'], 'been'], 1, 0]] },
  })
  for (const s of ['selected', 'draft', 'pulse', 'me']) map.addSource(s, { type: 'geojson', data: EMPTY })

  // Clusters: outer ring = share of "been", core = count
  map.addLayer({
    id: 'clusters-ring', type: 'circle', source: 'places', filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['interpolate', ['linear'], ['/', ['get', 'been'], ['get', 'point_count']], 0, planned, 1, been],
      'circle-radius': ['step', ['get', 'point_count'], 22, 10, 26, 50, 31, 200, 37],
      'circle-opacity': 0.25,
    },
  })
  map.addLayer({
    id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['interpolate', ['linear'], ['/', ['get', 'been'], ['get', 'point_count']], 0, planned, 1, been],
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 19, 50, 23, 200, 28],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })

  // Selection glow under the pin
  map.addLayer({
    id: 'selected-ring', type: 'circle', source: 'selected',
    paint: {
      'circle-radius': 16, 'circle-color': ['get', 'color'], 'circle-opacity': 0.22, 'circle-blur': 0.4,
      'circle-pitch-alignment': 'map',
    },
  })

  // Pulse ring for newly added places (animated via paint props)
  map.addLayer({
    id: 'pulse', type: 'circle', source: 'pulse',
    paint: { 'circle-radius': 0, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0 },
  })

  // Category pins
  map.addLayer({
    id: 'points', type: 'symbol', source: 'places', filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'category'], '-', ['get', 'status']],
      'icon-anchor': 'bottom',
      'icon-size': pinSize(null),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['-', 0, ['get', 'lat']],
      'text-field': ['step', ['zoom'], '', 12.5, ['get', 'name']],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11.5,
      'text-anchor': 'top',
      'text-offset': [0, 0.35],
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: { 'text-color': label, 'text-halo-color': halo, 'text-halo-width': 1.6 },
  })

  // Draft (unsaved) pin: ghost of the category pin
  map.addLayer({
    id: 'draft-dot', type: 'circle', source: 'draft',
    paint: { 'circle-radius': 5, 'circle-color': isDark.value ? '#fafafa' : '#18181b', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
  })
  map.addLayer({
    id: 'draft-pin', type: 'symbol', source: 'draft',
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'category'], '-planned'],
      'icon-anchor': 'bottom', 'icon-size': 1.05, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.92 },
  })

  // My location
  map.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 22, 'circle-color': '#3b82f6', 'circle-opacity': 0.16 } })
  map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', paint: { 'circle-radius': 7, 'circle-color': '#3b82f6', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })
}

function pinSize(selected: string | null): ExpressionSpecification {
  if (!selected) return ['interpolate', ['linear'], ['zoom'], 5, 0.62, 11, 0.85, 15, 1]
  const k: ExpressionSpecification = ['case', ['==', ['get', 'id'], selected], 1.3, 1]
  return ['interpolate', ['linear'], ['zoom'], 5, ['*', 0.62, k], 11, ['*', 0.85, k], 15, k]
}

// ---------- Sync state -> map ----------
function syncSelected() {
  if (!layersReady || !map) return
  const p = places.value.find(x => x.id === selectedId.value)
  setData('selected', p ? pointFC(p.lng, p.lat, { color: categoryOf(p.category).color }) : EMPTY)
  map.setLayoutProperty('points', 'icon-size', pinSize(p?.id ?? null))
}
function syncDraft() {
  const d = draft.value
  setData('draft', d ? pointFC(d.lng, d.lat, { category: d.category }) : EMPTY)
}

// Explored tint uses feature-state, so no tiles are re-parsed when places change
let appliedExplored = new Map<string, number>()
function syncExplored(force = false) {
  if (!map || !layersReady || !map.getSource('admin')) return
  const next = showExplored.value ? adminCounts.value.been : new Map<string, number>()
  if (force) appliedExplored = new Map()
  for (const [code] of appliedExplored) {
    if (!next.has(code)) map.setFeatureState({ source: 'admin', sourceLayer: levelOfCode(code), id: code }, { n: 0 })
  }
  for (const [code, n] of next) {
    if (appliedExplored.get(code) !== n) map.setFeatureState({ source: 'admin', sourceLayer: levelOfCode(code), id: code }, { n })
  }
  appliedExplored = new Map(next)
}

let selArea: string | null = null
function syncArea() {
  if (!map || !layersReady) return
  const code = area.value ? (area.value.village ? area.value.village.code.slice(0, 6) : area.value.code) : null
  if (selArea) map.setFeatureState({ source: 'admin', sourceLayer: levelOfCode(selArea), id: selArea }, { sel: false })
  selArea = code
  if (code) map.setFeatureState({ source: 'admin', sourceLayer: levelOfCode(code), id: code }, { sel: true })
}

function syncVisibility() {
  if (!map || !layersReady) return
  const b = showBoundaries.value ? 'visible' : 'none'
  for (const id of ['line-commune', 'line-district', 'line-province', 'line-province-glow', 'label-province', 'label-district', 'label-commune'])
    map.setLayoutProperty(id, 'visibility', b)
  for (const lvl of LEVELS) map.setLayoutProperty(`explored-${lvl}`, 'visibility', showExplored.value ? 'visible' : 'none')
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
watch(area, syncArea)
watch(() => adminCounts.value, () => syncExplored())
watch(showExplored, () => {
  syncExplored()
  syncVisibility()
})
watch(showBoundaries, syncVisibility)
watch(isDark, () => {
  layersReady = false
  map?.setStyle(styleUrl())
})

// ---------- Camera helpers ----------
function sheetPadding() {
  const h = window.innerHeight
  return { top: 90, bottom: Math.round(h * 0.45), left: 24, right: 24 }
}

function flyTo(lng: number, lat: number, zoom?: number) {
  if (!map) return
  const z = zoom ?? Math.max(map.getZoom(), 14)
  map.flyTo({ center: [lng, lat], zoom: z, padding: sheetPadding(), speed: 1.3, curve: 1.45, essential: false })
}

function fitBounds(b: [number, number, number, number], maxZoom = 14) {
  // flyTo's padding persists on the map; reset so it isn't added twice
  map?.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
  map?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: sheetPadding(), maxZoom, duration: 1100 })
}

function fitAll() {
  if (!map || !ml || !places.value.length) return
  const b = new ml.LngLatBounds()
  places.value.forEach(p => b.extend([p.lng, p.lat]))
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
  map.fitBounds(b, { padding: { top: 110, bottom: Math.round(window.innerHeight * 0.3), left: 48, right: 48 }, maxZoom: 13, duration: 1200 })
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
  if (!map || !layersReady) return
  setData('pulse', pointFC(lng, lat, { color }))
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const start = performance.now()
  const dur = 1100
  const step = (t: number) => {
    if (!map?.getLayer('pulse')) return
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
    // Default view: Cambodia
    center: cam?.center ?? [104.9, 12.55],
    zoom: cam?.zoom ?? 6.2,
    attributionControl: false,
    fadeDuration: 180,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    cancelPendingTileRequestsWhileZooming: true,
  })
  map.touchZoomRotate.disableRotation()

  map.on('style.load', () => void addLayers())
  map.once('idle', () => {
    loaded.value = true
    if (!cam && places.value.length) fitAll()
  })
  setTimeout(() => (loaded.value = true), 6000)

  map.on('movestart', () => emit('moving', true))
  map.on('moveend', () => {
    emit('moving', false)
    try {
      const c = map!.getCenter()
      localStorage.setItem(CAMERA_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map!.getZoom() }))
    } catch { /* storage unavailable */ }
  })

  // Tap: clusters zoom in, pins select, areas open their card, empty map clears
  map.on('click', async (e: MapMouseEvent) => {
    if (picking.value || !map || !layersReady) return
    const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'points'] })
    const cluster = hits.find(h => h.layer.id === 'clusters')
    if (cluster) {
      const src = map.getSource('places') as GeoJSONSource
      const zoom = await src.getClusterExpansionZoom(cluster.properties.cluster_id)
      map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3, duration: 650 })
      return
    }
    const point = hits.find(h => h.layer.id === 'points')
    if (point) {
      select(point.properties.id)
      const p = places.value.find(x => x.id === point.properties.id)
      if (p) flyTo(p.lng, p.lat)
      return
    }
    if (selectedId.value || draft.value) {
      select(null)
      return
    }
    if (showBoundaries.value) {
      const z = map.getZoom()
      const lvl: Level = z < ZOOM_SPLIT.district ? 'province' : z < ZOOM_SPLIT.commune ? 'district' : 'commune'
      const f = map.queryRenderedFeatures(e.point, { layers: [`sel-fill-${lvl}`] })[0]
      const code = f?.properties?.code ? String(f.properties.code) : null
      if (code && code !== area.value?.code) {
        if (navigator.vibrate) navigator.vibrate(6)
        openArea({ code })
        return
      }
    }
    if (area.value) select(null)
  })

  for (const id of ['clusters', 'points']) {
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
    fitBounds,
    fitAll,
    locate,
    pulse,
    zoom: () => map!.getZoom(),
    center: () => {
      const c = map!.getCenter()
      return { lng: c.lng, lat: c.lat }
    },
  }
})

let geoAbort: AbortController | null = null
async function startDraft(lng: number, lat: number, source: 'map' | 'location', category: CategoryId = 'other') {
  openDraft({ name: 'Dropped pin', category, address: formatCoords(lat, lng), lat, lng, source, loading: true })
  flyTo(lng, lat)
  geoAbort?.abort()
  geoAbort = new AbortController()
  const r = await reverseGeocode(lat, lng, geoAbort.signal)
  if (draft.value && draft.value.lat === lat && draft.value.lng === lng) {
    draft.value = {
      ...draft.value,
      name: r?.name ?? 'Dropped pin',
      category: draft.value.category !== 'other' ? draft.value.category : (r?.category ?? 'other'),
      address: r?.subtitle || formatCoords(lat, lng),
      loading: false,
    }
  }
}
defineExpose({ startDraft })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  mapApi.value = null
})
</script>
