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
          <span class="text-sm">{{ t('app.loadingMap') }}</span>
        </div>
      </div>
    </Transition>
    <p
      v-if="styleDef.satellite"
      class="pointer-events-none absolute left-2 z-[1] max-w-[58%] text-[9px] leading-tight text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]"
      :style="{ bottom: `${(snap === 'peek' ? 156 : 0) + 6}px` }"
    >
      {{ styleDef.credit }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Map as MLMap, GeoJSONSource, MapMouseEvent, MapTouchEvent, ExpressionSpecification, StyleSpecification } from 'maplibre-gl'
import { AUTO_STYLE, styleById, recolor, hybrid, fontsOf, OVERLAY_FLAG, SAT_SEA, SAT_SOURCES, type MapStyleDef } from '~/utils/mapStyles'
import { STATUS_COLORS } from '~/utils/db'
import { WHITE, whiteA } from '~/utils/colors'
import { haversineKm, formatKm, type LngLat } from '~/utils/geo'
import { categoryOf, matchesFilter, type CategoryId } from '~/utils/categories'
import { ensurePinImages } from '~/utils/pins'
import { adminCounts } from '~/composables/useAdmin'
import type { OfflineInfo } from '~/composables/useAppState'
import { HIDDEN_GEO_URL, HIDDEN_LABELS_URL, HIDDEN_NAME_PARTS } from '~/composables/useHidden'

const el = ref<HTMLElement>()
const loaded = ref(false)

const { places } = usePlaces()
const { selectedId, draft, area, filter, mapApi, picking, showBoundaries, showExplored, select, openDraft, openArea, measuring, measurePts, measureClosed } = useAppState()
const { isKm } = useLang()
const colorMode = useColorMode()
const emit = defineEmits<{ moving: [boolean] }>()
const { t } = useLang()

let map: MLMap | null = null
let ml: typeof import('maplibre-gl') | null = null
const { styleChoice, snap, camera, zooming, locateMode, satLabels, satTerrain, satHD, satSource, showTraffic, showStreet, streetView } = useAppState()
const keys = useKeys()
const styleDef = computed(() => styleById(styleChoice.value === AUTO_STYLE ? (colorMode.value === 'dark' ? 'dark' : 'liberty') : styleChoice.value))
const isDark = computed(() => styleDef.value.dark)
let fonts = { regular: ['Noto Sans Regular'], bold: ['Noto Sans Bold'], italic: ['Noto Sans Italic'] }

/** Style URL, or a repainted style object for Phaenti themes (base JSON is cached offline by the SW). */
function allAbsolute(st: StyleSpecification) {
  const links: unknown[] = [st.sprite, st.glyphs]
  for (const src of Object.values(st.sources ?? {})) {
    const x = src as { url?: string; tiles?: string[]; data?: unknown }
    links.push(x.url, ...(x.tiles ?? []), typeof x.data === 'string' ? x.data : undefined)
  }
  const flat = links.flatMap(l => (Array.isArray(l) ? l.map(v => (typeof v === 'object' && v ? (v as { url: string }).url : v)) : [l]))
  return flat.every(l => l == null || (typeof l === 'string' && /^https?:\/\//.test(l)))
}

async function resolveStyle(def: MapStyleDef): Promise<string | StyleSpecification> {
  const url = def.url.startsWith('/') ? `${location.origin}${def.url}` : def.url
  try {
    // Fetch the style ourselves so it downloads in parallel with the map library
    const base = await (await fetch(url)).json() as StyleSpecification
    if (def.satellite) return hybrid(base, SAT_SOURCES[satSource.value] ?? def.satellite, satHD.value && window.devicePixelRatio >= 1.5 ? 128 : 256)
    if (def.palette) return recolor(base, def.palette)
    // Only hand over the object when every link in it is absolute (relative ones need the style URL)
    return allAbsolute(base) ? base : url
  } catch {
    return url
  }
}
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
      .filter(p => matchesFilter(p, f))
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
  fonts = fontsOf(map.getStyle())
  await loadLabelArea()
  if (!map || map.getSource('places')) return
  hideCountries()
  apply3D()
  addAdminLayers()
  addPlaceLayers()
  layersReady = true
  syncSelected()
  syncDraft()
  syncExplored(true)
  syncArea()
  syncVisibility()
  if (lastMe) syncMe()
  syncRoute(false)
  syncMeasure()
  applySatellite()
  applyLive()
}

// ---------- Live layers: traffic (TomTom) and street-level photos (Mapillary) ----------
let trafficTimer: ReturnType<typeof setInterval> | undefined
function trafficTiles() {
  // Bucket by 2 minutes so tiles refresh but nearby requests still share the browser cache
  const t = Math.floor(Date.now() / 120000)
  return [`https://api.tomtom.com/traffic/map/4/tile/flow/${isDark.value ? 'relative0-dark' : 'relative0'}/{z}/{x}/{y}.png?key=${encodeURIComponent(keys.tomtom.value)}&tileSize=512&thickness=8&t=${t}`]
}
function applyLive() {
  if (!map || !layersReady) return
  // Traffic flow, under the labels; the hidden-country "sea" still covers it
  const wantTraffic = showTraffic.value && !!keys.tomtom.value
  if (wantTraffic && !map.getSource('traffic')) {
    map.addSource('traffic', { type: 'raster', tiles: trafficTiles(), tileSize: 512, minzoom: 6, maxzoom: 22 })
    const before = map.getLayer('hidden-fill') ? 'hidden-fill' : undefined
    map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', minzoom: 6, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } }, before)
    clearInterval(trafficTimer)
    trafficTimer = setInterval(() => (map?.getSource('traffic') as unknown as { setTiles?: (t: string[]) => void })?.setTiles?.(trafficTiles()), 120000)
  } else if (!wantTraffic && map.getSource('traffic')) {
    clearInterval(trafficTimer)
    map.removeLayer('traffic')
    map.removeSource('traffic')
  }
  // Street-level photo coverage: green lines, then dots you can tap (from zoom 14)
  const wantStreet = showStreet.value && !!keys.mapillary.value
  if (wantStreet && !map.getSource('mly')) {
    map.addSource('mly', {
      type: 'vector', minzoom: 6, maxzoom: 14,
      tiles: [`https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(keys.mapillary.value)}`],
    })
    const before = map.getLayer('clusters') ? 'clusters' : undefined
    map.addLayer({
      id: 'mly-seq', type: 'line', source: 'mly', 'source-layer': 'sequence',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#05cb63', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 3, 18, 5] },
    }, before)
    map.addLayer({
      id: 'mly-img', type: 'circle', source: 'mly', 'source-layer': 'image', minzoom: 14,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 6], 'circle-color': '#05cb63', 'circle-stroke-width': 1.5, 'circle-stroke-color': WHITE },
    }, before)
  } else if (!wantStreet && map.getSource('mly')) {
    for (const l of ['mly-img', 'mly-seq']) if (map.getLayer(l)) map.removeLayer(l)
    map.removeSource('mly')
  }
  syncStreetPos()
}
watch([showTraffic, showStreet, () => keys.tomtom.value, () => keys.mapillary.value], () => {
  if (!map) return
  // Keys changed: rebuild the sources with the new key
  for (const [src, layers] of [['traffic', ['traffic']], ['mly', ['mly-img', 'mly-seq']]] as const) {
    if (map.getSource(src)) {
      for (const l of layers) if (map.getLayer(l)) map.removeLayer(l)
      map.removeSource(src)
    }
  }
  applyLive()
})
// Where the street photo you're looking at was taken
function syncStreetPos() {
  if (!map || !layersReady) return
  if (!map.getSource('street-pos')) {
    map.addSource('street-pos', { type: 'geojson', data: EMPTY })
    map.addLayer({ id: 'street-pos', type: 'circle', source: 'street-pos', paint: { 'circle-radius': 9, 'circle-color': '#05cb63', 'circle-stroke-width': 3, 'circle-stroke-color': WHITE } })
  }
  const v = streetView.value
  setData('street-pos', v ? pointFC(v.lng, v.lat) : EMPTY)
}
watch(streetView, syncStreetPos, { deep: true })

// ---------- Satellite extras: labels on/off and 3D terrain ----------
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
function applySatellite() {
  if (!map || !styleDef.value.satellite) return
  const vis = satLabels.value ? 'visible' : 'none'
  for (const l of map.getStyle().layers) {
    if ((l as { metadata?: Record<string, unknown> }).metadata?.[OVERLAY_FLAG]) map.setLayoutProperty(l.id, 'visibility', vis)
  }
  if (satTerrain.value) {
    if (!map.getSource('dem')) map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15 })
    map.setTerrain({ source: 'dem', exaggeration: 1.5 })
    const m = map as unknown as { setSky?: (s: Record<string, unknown>) => void }
    m.setSky?.({ 'sky-color': '#6fa8dc', 'horizon-color': '#cfe3f5', 'fog-color': '#dbe9f6', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 })
    if (map.getPitch() < 20) map.easeTo({ pitch: 55, duration: 900 })
  } else if (map.getTerrain()) {
    map.setTerrain(null)
  }
}
watch([satLabels, satTerrain], () => applySatellite())

// ---------- Hidden countries (Thailand) ----------
/** Basemap filters may use the legacy syntax, which can't be mixed with expressions. */
function isExpressionFilter(f: unknown): boolean {
  if (f === true || f === false) return true
  if (!Array.isArray(f) || !f.length) return false
  switch (f[0]) {
    case 'has': return f.length >= 2 && f[1] !== '$id' && f[1] !== '$type'
    case 'in': return f.length >= 3 && (typeof f[1] !== 'string' || Array.isArray(f[2]))
    case '!in': case '!has': case 'none': return false
    case '==': case '!=': case '>': case '>=': case '<': case '<=': return f.length !== 3 || Array.isArray(f[1]) || Array.isArray(f[2])
    case 'any': case 'all': return f.slice(1).every(x => typeof x === 'boolean' || isExpressionFilter(x))
    default: return true
  }
}

/** Where basemap labels are hidden. `gate` is a cheap outline (~80 points) checked first;
 *  only labels inside it are tested against the finer `area` (~300 points). One big
 *  outline made every tile in western Cambodia ~16× slower to prepare. */
let labelArea: { gate: GeoJSON.MultiPolygon; area: GeoJSON.MultiPolygon } | null = null
/** Common Thai-script letters: a label containing any of them is Thai, wherever it sits */
const THAI_CHARS = ['า', 'ร', 'น', 'อ', 'ง', 'ม', 'ก', 'เ', 'ี', 'ั', '่', '้']
let convertFilter: ((f: unknown) => unknown) | null = null
async function loadLabelArea() {
  // Loaded lazily alongside the map so the app's first screen stays small
  convertFilter ??= (await import('@maplibre/maplibre-gl-style-spec/dist/feature_filter/convert.mjs')).convertFilter as (f: unknown) => unknown
  if (labelArea) return
  try {
    const j = await (await fetch(HIDDEN_LABELS_URL)).json()
    if (j?.gate && j?.area) labelArea = j
  } catch { /* offline before first cache */ }
}

function hideCountries() {
  if (!map || map.getSource('hidden')) return
  const style = map.getStyle()
  // 1. Remove basemap labels that sit inside the hidden country, or that name it
  //    ("Thailand", "Gulf of Thailand", "ไทย"…). Done with filters, so no letters
  //    are left peeking out across the border.
  const fields = ['name', 'name_en', 'name:en', 'name:latin', 'name_int', 'name:nonlatin']
  // Cheapest checks first: 'any' stops at the first match
  const hiddenLabel: ExpressionSpecification = ['any',
    ...fields.flatMap(k => HIDDEN_NAME_PARTS.map(p => ['in', p, ['to-string', ['get', k]]] as ExpressionSpecification)),
    ...['name', 'name:nonlatin'].flatMap(k => THAI_CHARS.map(c => ['in', c, ['to-string', ['get', k]]] as ExpressionSpecification)),
    ...(labelArea ? [['all', ['within', labelArea.gate], ['within', labelArea.area]] as unknown as ExpressionSpecification] : []),
  ]
  for (const l of style.layers) {
    if (l.type !== 'symbol') continue
    const f = (l as { filter?: unknown }).filter
    let base: ExpressionSpecification | boolean = true
    try {
      base = f === undefined ? true : isExpressionFilter(f) ? (f as ExpressionSpecification) : (convertFilter!(f) as ExpressionSpecification)
    } catch { continue }
    try {
      map.setFilter(l.id, base === true ? ['!', hiddenLabel] : ['all', base as ExpressionSpecification, ['!', hiddenLabel]])
    } catch { /* keep the layer's own filter if MapLibre rejects the combination */ }
  }
  // 2. Turn the country into sea: fill its land with the style's own water colour,
  //    above every basemap layer, so it blends into the surrounding water.
  map.addSource('hidden', { type: 'geojson', data: `${location.origin}${HIDDEN_GEO_URL}`, maxzoom: 12, tolerance: 0.6, buffer: 32 })
  map.addLayer({ id: 'hidden-fill', type: 'fill', source: 'hidden', paint: { 'fill-color': waterColor(style), 'fill-antialias': true } })
  // On photos a hard edge looks cut out: feather it so the "sea" blends into the coast
  if (styleDef.value.satellite) {
    map.addLayer({
      id: 'hidden-edge', type: 'line', source: 'hidden',
      paint: { 'line-color': SAT_SEA, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 10, 14, 18], 'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 8, 14, 14], 'line-opacity': 0.9 },
    })
  }
}

/** The style's sea colour: a plain colour, or a zoom-only expression we can reuse as-is. */
function waterColor(style: StyleSpecification): unknown {
  if (styleDef.value.satellite) return SAT_SEA
  const fills = style.layers.filter(l => l.type === 'fill') as { id: string; 'source-layer'?: string; paint?: Record<string, unknown> }[]
  const water = fills.find(l => /ocean|sea/.test(l.id))
    ?? fills.find(l => l['source-layer'] === 'water' || l['source-layer'] === 'ocean')
    ?? fills.find(l => /water/.test(l.id))
  const c = water?.paint?.['fill-color']
  if (typeof c === 'string') return c
  if (Array.isArray(c) && !JSON.stringify(c).includes('"get"') && !JSON.stringify(c).includes('feature-state')) return c
  return isDark.value ? '#1b2633' : '#a8cbe8'
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
      'line-color': dark ? '#0f172a' : WHITE,
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
  const halo = dark ? 'rgba(9,9,11,0.85)' : whiteA(0.9)
  map.addLayer({
    id: 'label-province', type: 'symbol', source: 'admin', 'source-layer': 'label_province', minzoom: 5, maxzoom: 8.5,
    layout: {
      'text-field': ['upcase', ['get', 'name']], 'text-font': fonts.bold,
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9.5, 8, 13], 'text-letter-spacing': 0.14, 'text-max-width': 7,
    },
    paint: { 'text-color': dark ? '#e2e8f0' : '#334155', 'text-halo-color': halo, 'text-halo-width': 1.4, 'text-opacity': 0.85 },
  })
  map.addLayer({
    id: 'label-district', type: 'symbol', source: 'admin', 'source-layer': 'label_district', minzoom: 8.3, maxzoom: 11,
    layout: {
      'text-field': ['get', 'name'], 'text-font': fonts.italic, 'text-size': 11.5, 'text-max-width': 8,
      'symbol-sort-key': ['-', ['get', 'area']],
    },
    paint: { 'text-color': dark ? '#cbd5e1' : '#475569', 'text-halo-color': halo, 'text-halo-width': 1.3 },
  })
  map.addLayer({
    id: 'label-commune', type: 'symbol', source: 'admin', 'source-layer': 'label_commune', minzoom: 10.6, maxzoom: 13.5,
    layout: {
      'text-field': ['get', 'name'], 'text-font': fonts.italic, 'text-size': 10.5, 'text-max-width': 8,
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
  const halo = isDark.value ? '#09090b' : WHITE

  map.addSource('places', {
    type: 'geojson',
    data: placesGeoJSON(),
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 12,
    clusterProperties: { been: ['+', ['case', ['==', ['get', 'status'], 'been'], 1, 0]] },
  })
  for (const s of ['selected', 'draft', 'pulse', 'me']) map.addSource(s, { type: 'geojson', data: EMPTY })

  // Route (under the pins)
  for (const s of ['route', 'route-ends']) map.addSource(s, { type: 'geojson', data: EMPTY, lineMetrics: s === 'route' } as never)
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': isDark.value ? '#0b1020' : WHITE, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 6, 14, 12], 'line-opacity': 0.95 },
  })
  map.addLayer({
    id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3.5, 14, 7.5] },
  })
  map.addLayer({
    id: 'route-ends', type: 'circle', source: 'route-ends',
    paint: {
      'circle-radius': 7, 'circle-color': ['get', 'color'],
      'circle-stroke-width': 3, 'circle-stroke-color': WHITE,
    },
  })

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
      'circle-stroke-color': WHITE,
    },
  })
  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': fonts.bold, 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': WHITE },
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
      'text-font': fonts.bold,
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
    paint: { 'circle-radius': 5, 'circle-color': isDark.value ? '#fafafa' : '#18181b', 'circle-stroke-width': 2, 'circle-stroke-color': WHITE },
  })
  map.addLayer({
    id: 'draft-pin', type: 'symbol', source: 'draft',
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'category'], '-planned'],
      'icon-anchor': 'bottom', 'icon-size': 1.05, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.92 },
  })

  // Measuring tool (on top of everything)
  for (const s of ['measure-fill', 'measure-line', 'measure-pts']) map.addSource(s, { type: 'geojson', data: EMPTY })
  map.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure-fill', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.15 } })
  map.addLayer({
    id: 'measure-line', type: 'line', source: 'measure-line', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 1.2] },
  })
  map.addLayer({
    id: 'measure-pts', type: 'circle', source: 'measure-pts',
    paint: {
      'circle-radius': ['case', ['get', 'first'], 8, 6.5],
      'circle-color': WHITE, 'circle-stroke-width': 3, 'circle-stroke-color': '#f59e0b',
    },
  })
  map.addLayer({
    id: 'measure-labels', type: 'symbol', source: 'measure-pts', filter: ['!=', ['get', 'label'], ''],
    layout: { 'text-field': ['get', 'label'], 'text-font': fonts.bold, 'text-size': 12, 'text-offset': [0, -1.6], 'text-allow-overlap': true },
    paint: { 'text-color': isDark.value ? '#fde68a' : '#92400e', 'text-halo-color': isDark.value ? '#0b1020' : WHITE, 'text-halo-width': 2 },
  })

  // My location: accuracy circle, direction beam, blue dot
  map.addLayer({ id: 'me-acc', type: 'circle', source: 'me', paint: { 'circle-radius': accuracyRadius(), 'circle-color': '#3b82f6', 'circle-opacity': 0.12, 'circle-stroke-width': 1, 'circle-stroke-color': '#3b82f6', 'circle-stroke-opacity': 0.35, 'circle-pitch-alignment': 'map' } })
  if (!map.hasImage('me-beam')) map.addImage('me-beam', beamImage(), { pixelRatio: 2 })
  map.addLayer({
    id: 'me-beam', type: 'symbol', source: 'me', filter: ['has', 'heading'],
    layout: { 'icon-image': 'me-beam', 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
  })
  map.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 22, 'circle-color': '#3b82f6', 'circle-opacity': 0.16 } })
  map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', paint: { 'circle-radius': 7, 'circle-color': '#3b82f6', 'circle-stroke-width': 3, 'circle-stroke-color': WHITE } })
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

// ---------- Route ----------
let routeData: { coords: LngLat[]; color: string } | null = null
let routeAnim = 0
function syncRoute(animate: boolean) {
  if (!map || !layersReady) return
  cancelAnimationFrame(routeAnim)
  if (!routeData) {
    setData('route', EMPTY)
    setData('route-ends', EMPTY)
    return
  }
  const { coords, color } = routeData
  const line = (c: LngLat[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: c } }] })
  setData('route-ends', {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { color: '#10b981' }, geometry: { type: 'Point', coordinates: coords[0]! } },
      { type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: coords[coords.length - 1]! } },
    ],
  })
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setData('route', line(coords))
    return
  }
  // Draw the line from start to finish
  const start = performance.now()
  const dur = 900
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    const n = Math.max(2, Math.round(coords.length * e))
    setData('route', line(coords.slice(0, n)))
    if (k < 1) routeAnim = requestAnimationFrame(step)
  }
  routeAnim = requestAnimationFrame(step)
}
function showRoute(coords: LngLat[], color: string) {
  routeData = { coords, color }
  syncRoute(true)
  if (!map || coords.length < 2) return
  let w = 180, s = 90, e = -180, n = -90
  for (const [x, y] of coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y) }
  fitBounds([w, s, e, n], 16)
}
function clearRoute() {
  routeData = null
  syncRoute(false)
}

// ---------- Measuring ----------
function syncMeasure() {
  if (!map || !layersReady) return
  const pts = measurePts.value
  const closed = measureClosed.value && pts.length >= 3
  const ring = closed ? [...pts, pts[0]!] : pts
  setData('measure-line', ring.length >= 2 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } }] } : EMPTY)
  setData('measure-fill', closed ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] } : EMPTY)
  let acc = 0
  setData('measure-pts', {
    type: 'FeatureCollection',
    features: pts.map((p, i) => {
      if (i) acc += haversineKm(pts[i - 1]!, p)
      return { type: 'Feature', properties: { i, first: i === 0, label: i ? formatKm(acc, isKm.value) : '' }, geometry: { type: 'Point', coordinates: p } }
    }),
  })
  map.getCanvas().style.cursor = measuring.value ? 'crosshair' : ''
}
watch([measurePts, measureClosed, measuring], syncMeasure)

function measureClick(e: MapMouseEvent) {
  if (!map) return
  const pts = measurePts.value
  const hit = map.queryRenderedFeatures([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]], { layers: ['measure-pts'] })[0]
  // Tap the first point to close the shape and get its area
  if (hit && hit.properties.first && pts.length >= 3 && !measureClosed.value) {
    measureClosed.value = true
    haptic('success')
    return
  }
  if (hit || measureClosed.value) return
  measurePts.value = [...pts, [e.lngLat.lng, e.lngLat.lat]]
  haptic('tap')
}

// Drag a point to adjust it
let dragIndex = -1
function onMeasureDown(e: MapMouseEvent | MapTouchEvent) {
  if (!measuring.value || !map) return
  if ('originalEvent' in e && (e.originalEvent as TouchEvent).touches?.length > 1) return
  const f = map.queryRenderedFeatures([[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]], { layers: ['measure-pts'] })[0]
  if (!f) return
  e.preventDefault()
  dragIndex = Number(f.properties.i)
  map.dragPan.disable()
}
function onMeasureMove(e: MapMouseEvent | MapTouchEvent) {
  if (dragIndex < 0) return
  const pts = [...measurePts.value]
  pts[dragIndex] = [e.lngLat.lng, e.lngLat.lat]
  measurePts.value = pts
}
function onMeasureUp() {
  if (dragIndex < 0 || !map) return
  dragIndex = -1
  map.dragPan.enable()
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
let styleSeq = 0
watch([styleDef, () => styleDef.value.satellite && `${satSource.value}${satHD.value}`], async ([def]) => {
  const seq = ++styleSeq
  const style = await resolveStyle(def)
  if (seq !== styleSeq || !map) return
  layersReady = false
  map.setStyle(style, { diff: false })
})

// ---------- 3D ----------
function apply3D() {
  if (!map) return
  const on = !!styleDef.value.extrude
  if (on) {
    const style = map.getStyle()
    const bSrc = (style.layers as { source?: string; 'source-layer'?: string }[]).find(l => l['source-layer'] === 'building')?.source
    if (bSrc && !map.getLayer('phaenti-3d')) {
      const firstLabel = style.layers.find(l => l.type === 'symbol')?.id
      map.addLayer({
        id: 'phaenti-3d', type: 'fill-extrusion', source: bSrc, 'source-layer': 'building', minzoom: 13.5,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#e8dfd3', 40, '#d4c5b3', 120, '#b9a58f'],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, ['coalesce', ['get', 'render_height'], 6]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      }, firstLabel)
    }
    map.setMaxPitch(70)
    map.dragRotate.enable()
    map.touchPitch.enable()
    map.touchZoomRotate.enableRotation()
    map.easeTo({ pitch: 58, bearing: map.getBearing() || -18, zoom: Math.max(map.getZoom(), 15.4), duration: 1400 })
  } else {
    map.setMaxPitch(60)
    if (map.getPitch() > 1) map.easeTo({ pitch: 0, duration: 800 })
  }
}

// ---------- Camera helpers ----------
// Keep the target in the part of the map the sheet leaves visible
function sheetPadding() {
  const h = window.innerHeight
  const bottom = snap.value === 'peek' ? 180 : Math.round(h * 0.52) + 16
  return { top: 90, bottom: Math.min(bottom, h - 200), left: 24, right: 24 }
}

function flyTo(lng: number, lat: number, zoom?: number, pad?: Partial<{ top: number; bottom: number; left: number; right: number }>) {
  if (!map) return
  const z = zoom ?? Math.max(map.getZoom(), 14)
  map.flyTo({ center: [lng, lat], zoom: z, padding: { ...sheetPadding(), ...pad }, speed: 1.3, curve: 1.45, essential: false })
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

// ---------- My location (Google-style: dot, accuracy, direction, follow, compass) ----------
let lastMe: { lng: number; lat: number; acc: number } | null = null
let heading: number | null = null
let watchId: number | null = null

function syncMe() {
  if (!lastMe || !map || !layersReady) return
  setData('me', pointFC(lastMe.lng, lastMe.lat, heading == null ? {} : { heading }))
  if (map.getLayer('me-acc')) map.setPaintProperty('me-acc', 'circle-radius', accuracyRadius())
}
/** Accuracy in metres → circle radius in pixels at every zoom */
function accuracyRadius(): ExpressionSpecification | number {
  if (!lastMe) return 0
  const r0 = (Math.min(lastMe.acc, 3000) * 512) / (40075016.686 * Math.cos((lastMe.lat * Math.PI) / 180))
  return ['interpolate', ['exponential', 2], ['zoom'], 0, r0, 22, r0 * 4194304]
}
/** A soft blue wedge pointing up, rotated to where the phone faces */
function beamImage() {
  const size = 200
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const grad = g.createRadialGradient(cx, cx, 6, cx, cx, cx)
  grad.addColorStop(0, 'rgba(59,130,246,0.55)')
  grad.addColorStop(1, 'rgba(59,130,246,0)')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(cx, cx)
  g.arc(cx, cx, cx, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42)
  g.closePath()
  g.fill()
  return g.getImageData(0, 0, size, size)
}

function onPosition(pos: GeolocationPosition, recenter: boolean) {
  const first = !lastMe
  lastMe = { lng: pos.coords.longitude, lat: pos.coords.latitude, acc: pos.coords.accuracy || 30 }
  // Moving fast: the GPS course is a better arrow than the compass
  if (pos.coords.heading != null && !Number.isNaN(pos.coords.heading) && (pos.coords.speed ?? 0) > 1.5) heading = pos.coords.heading
  syncMe()
  if (!map) return
  if (first || recenter) flyTo(lastMe.lng, lastMe.lat, Math.max(map.getZoom(), 15.5))
  else if (locateMode.value === 'follow' || locateMode.value === 'compass') {
    map.easeTo({ center: [lastMe.lng, lastMe.lat], duration: 700, padding: sheetPadding() })
  }
}

function startWatch() {
  if (watchId != null || !navigator.geolocation) return
  watchId = navigator.geolocation.watchPosition(p => onPosition(p, false), () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
  startCompass()
}
function stopWatch() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  stopCompass()
}

// Compass (device orientation). iOS asks for permission on a tap.
let lastHeadingAt = 0
function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }) {
  let h: number | null = null
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading
  else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360
  if (h == null) return
  const now = performance.now()
  if (now - lastHeadingAt < 120) return
  lastHeadingAt = now
  heading = Math.round(h)
  syncMe()
  if (locateMode.value === 'compass' && map) map.easeTo({ bearing: heading, duration: 200, easing: t => t })
}
let compassOn = false
function startCompass() {
  if (compassOn) return
  compassOn = true
  window.addEventListener('deviceorientationabsolute' as 'deviceorientation', onOrientation as EventListener)
  window.addEventListener('deviceorientation', onOrientation as EventListener)
}
function stopCompass() {
  compassOn = false
  window.removeEventListener('deviceorientationabsolute' as 'deviceorientation', onOrientation as EventListener)
  window.removeEventListener('deviceorientation', onOrientation as EventListener)
}
async function askCompassPermission() {
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  if (typeof DOE?.requestPermission === 'function') {
    try { return (await DOE.requestPermission()) === 'granted' } catch { return false }
  }
  return true
}

/** One-shot fix (used by "Add here" and routing); also starts showing the dot */
function locate() {
  return new Promise<{ lng: number; lat: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPosition(pos, true)
        if (locateMode.value === 'off') locateMode.value = 'shown'
        startWatch()
        resolve({ lng: lastMe!.lng, lat: lastMe!.lat })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  })
}

/** My-location button: show + follow → compass (map turns with the phone) → follow */
async function cycleLocate(): Promise<boolean> {
  const m = locateMode.value
  if (m === 'follow') {
    await askCompassPermission()
    startCompass()
    locateMode.value = 'compass'
    if (heading != null) map?.easeTo({ bearing: heading, duration: 500 })
    return true
  }
  if (m === 'compass') {
    locateMode.value = 'follow'
    map?.easeTo({ bearing: 0, duration: 500 })
    return true
  }
  const pos = await locate()
  if (!pos) return false
  locateMode.value = 'follow'
  return true
}

function resetNorth() {
  if (!map) return
  if (locateMode.value === 'compass') locateMode.value = 'follow'
  map.easeTo({ bearing: 0, pitch: styleDef.value.extrude ? map.getPitch() : 0, duration: 600 })
}

if (import.meta.client) {
  document.addEventListener('visibilitychange', () => {
    // Save battery: no GPS while the app is in the background
    if (document.hidden) stopWatch()
    else if (locateMode.value !== 'off') startWatch()
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
  // Download the map library, its worker and the style all at once
  const [mod, worker, , initialStyle] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
    resolveStyle(styleDef.value),
    loadLabelArea(),
  ])
  mod.setWorkerUrl(worker.default)
  ml = mod
  const cam = savedCamera()
  map = new mod.Map({
    container: el.value!,
    style: initialStyle,
    // Default view: Cambodia
    center: cam?.center ?? [104.9, 12.55],
    zoom: cam?.zoom ?? 6.2,
    attributionControl: false,
    fadeDuration: 120,
    // Phones are often 3× screens: drawing at 2× looks the same and is ~2× less work per frame
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    // Keep more recently seen tiles in memory so panning back is instant
    maxTileCacheZoomLevels: 6,
    // Two-finger rotate and tilt, like Google Maps; the compass button puts north back up
    maxPitch: 60,
    cancelPendingTileRequestsWhileZooming: true,
  })

  map.on('style.load', () => void addLayers())
  map.once('idle', () => {
    loaded.value = true
    if (!cam && places.value.length) fitAll()
  })
  setTimeout(() => (loaded.value = true), 6000)

  map.on('movestart', () => emit('moving', true))
  // Live camera for the compass and scale bar (once per frame at most)
  let camQueued = false
  const pushCamera = () => {
    if (camQueued) return
    camQueued = true
    requestAnimationFrame(() => {
      camQueued = false
      if (!map) return
      camera.value = { bearing: map.getBearing(), pitch: map.getPitch(), zoom: map.getZoom(), lat: map.getCenter().lat }
    })
  }
  map.on('move', pushCamera)
  pushCamera()
  map.on('zoomstart', () => (zooming.value = true))
  map.on('zoomend', () => (zooming.value = false))
  // Touching the map stops following you (the dot stays)
  const userMove = (e: { originalEvent?: Event }) => {
    if (e.originalEvent && (locateMode.value === 'follow' || locateMode.value === 'compass')) locateMode.value = 'shown'
  }
  map.on('dragstart', userMove)
  map.on('rotatestart', userMove)

  // Panning the map by hand lowers an expanded list, like native maps apps
  map.on('dragstart', () => {
    if (snap.value !== 'peek' && !draft.value) snap.value = 'peek'
  })
  map.on('moveend', () => {
    emit('moving', false)
    try {
      const c = map!.getCenter()
      localStorage.setItem(CAMERA_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map!.getZoom() }))
    } catch { /* storage unavailable */ }
  })

  // Tap: clusters zoom in, pins select, areas open their card, empty map clears
  map.on('mousedown', onMeasureDown)
  map.on('touchstart', onMeasureDown)
  map.on('mousemove', onMeasureMove)
  map.on('touchmove', onMeasureMove)
  map.on('mouseup', onMeasureUp)
  map.on('touchend', onMeasureUp)

  map.on('click', async (e: MapMouseEvent) => {
    if (picking.value || !map || !layersReady) return
    if (measuring.value) {
      measureClick(e)
      return
    }
    const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'points'] })
    const cluster = hits.find(h => h.layer.id === 'clusters')
    if (cluster) {
      const src = map.getSource('places') as GeoJSONSource
      const zoom = await src.getClusterExpansionZoom(cluster.properties.cluster_id)
      map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3, duration: 650 })
      return
    }
    const point = hits.find(h => h.layer.id === 'points')
    if (!point && map.getLayer('mly-img')) {
      const sv = map.queryRenderedFeatures([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]], { layers: ['mly-img'] })[0]
      if (sv?.properties?.id) {
        haptic('select')
        const [lng, lat] = (sv.geometry as GeoJSON.Point).coordinates as [number, number]
        streetView.value = { imageId: String(sv.properties.id), lat, lng }
        return
      }
    }
    if (point) {
      haptic('select')
      select(point.properties.id)
      const p = places.value.find(x => x.id === point.properties.id)
      if (p) flyTo(p.lng, p.lat)
      return
    }
    if (selectedId.value || draft.value) {
      select(null)
      return
    }
    // Tapping the map while the list is up just lowers the sheet to show the map
    if (snap.value !== 'peek' && !area.value) {
      snap.value = 'peek'
      return
    }
    if (showBoundaries.value) {
      const z = map.getZoom()
      const lvl: Level = z < ZOOM_SPLIT.district ? 'province' : z < ZOOM_SPLIT.commune ? 'district' : 'commune'
      const f = map.queryRenderedFeatures(e.point, { layers: [`sel-fill-${lvl}`] })[0]
      const code = f?.properties?.code ? String(f.properties.code) : null
      if (code && code !== area.value?.code) {
        haptic('select')
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
    haptic('tap')
    startDraft(lng, lat, 'map')
  }
  map.on('touchstart', (e: MapTouchEvent) => {
    clearTimeout(pressTimer)
    if (e.originalEvent.touches.length !== 1 || picking.value || measuring.value) return
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
  // Desktop: right-click drops a pin, right-drag rotates/tilts (so wait for the button to come up)
  let rightDown: { x: number; y: number } | null = null
  const box = map.getCanvasContainer()
  // Capture phase: the map's own gesture handlers may stop these events
  window.addEventListener('mousedown', (e) => {
    rightDown = e.button === 2 && box.contains(e.target as Node) ? { x: e.clientX, y: e.clientY } : null
  }, true)
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 2 || !rightDown || !map || measuring.value) return
    const moved = Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y)
    rightDown = null
    if (moved >= 5) return
    const r = box.getBoundingClientRect()
    const ll = map.unproject([e.clientX - r.left, e.clientY - r.top])
    dropAt(ll.lng, ll.lat)
  }, true)

  mapApi.value = {
    showRoute,
    clearRoute,
    offlineInfo,
    flyTo,
    fitBounds,
    fitAll,
    locate,
    cycleLocate,
    resetNorth,
    pulse,
    zoom: () => map!.getZoom(),
    center: () => {
      const c = map!.getCenter()
      return { lng: c.lng, lat: c.lat }
    },
  }
})

/** Everything needed to save the current basemap for offline use. */
function offlineInfo(): OfflineInfo | null {
  if (!map) return null
  const style = map.getStyle()
  const sources: OfflineInfo['sources'] = []
  for (const [id, def] of Object.entries(style.sources)) {
    if (id === 'admin' || (def.type !== 'vector' && def.type !== 'raster')) continue
    const src = map.getSource(id) as unknown as { tiles?: string[]; minzoom?: number; maxzoom?: number } | undefined
    if (src?.tiles?.length) sources.push({ tiles: src.tiles, minzoom: src.minzoom ?? 0, maxzoom: src.maxzoom ?? 14 })
  }
  const fonts = new Set<string>()
  for (const l of style.layers) {
    const f = (l as { layout?: Record<string, unknown> }).layout?.['text-font']
    if (Array.isArray(f) && f.every(x => typeof x === 'string')) fonts.add((f as string[]).join(','))
  }
  const b = map.getBounds()
  return {
    sources,
    glyphs: typeof style.glyphs === 'string' ? style.glyphs : null,
    fonts: [...fonts],
    bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    zoom: map.getZoom(),
  }
}

let geoAbort: AbortController | null = null
async function startDraft(lng: number, lat: number, source: 'map' | 'location', category: CategoryId = 'other') {
  if (!openDraft({ name: t('place.droppedPin'), category, address: formatCoords(lat, lng), lat, lng, source, loading: true })) return
  flyTo(lng, lat)
  geoAbort?.abort()
  geoAbort = new AbortController()
  const r = await reverseGeocode(lat, lng, geoAbort.signal)
  if (draft.value && draft.value.lat === lat && draft.value.lng === lng) {
    draft.value = {
      ...draft.value,
      name: r?.name ?? t('place.droppedPin'),
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
