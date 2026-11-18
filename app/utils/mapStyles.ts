// Basemap styles. Three kinds:
//  - url:     a hosted style (OpenFreeMap) or one bundled in /styles (VersaTiles, pinned)
//  - recolor: OpenFreeMap Liberty data repainted with a Phaenti palette
//  - 3D:      Liberty plus extruded buildings and tilt
import type { StyleSpecification, LayerSpecification } from 'maplibre-gl'

export interface Palette {
  land: string
  water: string
  waterLine: string
  park: string
  forest: string
  sand: string
  urban: string
  building: string
  road: string
  roadMajor: string
  casing: string
  rail: string
  boundary: string
  label: string
  labelMinor: string
  waterLabel: string
  halo: string
  pois: boolean
}

export interface Swatch { land: string; water: string; park: string; road: string; roadMajor: string; building: string }

export interface MapStyleDef {
  id: string
  label: string
  tag: string
  dark: boolean
  url: string
  palette?: Palette
  extrude?: boolean
  swatch: Swatch
  credit: string
}

const OFM = 'https://tiles.openfreemap.org/styles'
const OFM_CREDIT = 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors'
const VT_CREDIT = 'VersaTiles · © OpenStreetMap contributors'

const ANGKOR: Palette = {
  land: '#f1e4c8', water: '#7cbfb1', waterLine: '#5aa596', park: '#d3d9a4', forest: '#bccb8a', sand: '#ecd7a8',
  urban: '#ead8b6', building: '#e0c69c', road: '#fbf3e3', roadMajor: '#c8673f', casing: '#d9b98c', rail: '#b08d63',
  boundary: '#8b5a2b', label: '#4e2f16', labelMinor: '#7a5532', waterLabel: '#2f6f63', halo: '#f7edd6', pois: true,
}
const MEKONG_NIGHT: Palette = {
  land: '#0c1631', water: '#06203d', waterLine: '#0d3a63', park: '#0f2733', forest: '#0f2a33', sand: '#1a2440',
  urban: '#111d3d', building: '#17264b', road: '#243866', roadMajor: '#f2b33d', casing: '#0a1430', rail: '#3b4f80',
  boundary: '#6c80b8', label: '#e9eefb', labelMinor: '#a9b6d8', waterLabel: '#6fa8dc', halo: '#0a1430', pois: false,
}
const RICE_PADDY: Palette = {
  land: '#eef4dc', water: '#8fcac6', waterLine: '#6db5b0', park: '#bfdc8e', forest: '#a8cf7a', sand: '#efe6c2',
  urban: '#e3e9cf', building: '#d9e1c2', road: '#ffffff', roadMajor: '#e8a63e', casing: '#c9d4ab', rail: '#9aa77d',
  boundary: '#6b7d45', label: '#33421f', labelMinor: '#56663a', waterLabel: '#2e7672', halo: '#f7faee', pois: true,
}

export const MAP_STYLES: MapStyleDef[] = [
  { id: 'liberty', label: 'Liberty', tag: 'Classic', dark: false, url: `${OFM}/liberty`, credit: OFM_CREDIT,
    swatch: { land: '#f8f4f0', water: '#a0c8f0', park: '#d8e8c8', road: '#ffffff', roadMajor: '#fcd6a4', building: '#e5ddd3' } },
  { id: 'positron', label: 'Positron', tag: 'Minimal', dark: false, url: `${OFM}/positron`, credit: OFM_CREDIT,
    swatch: { land: '#f2f3f0', water: '#c2c8ca', park: '#e5e9df', road: '#ffffff', roadMajor: '#e3e3e3', building: '#e7e7e4' } },
  { id: 'bright', label: 'Bright', tag: 'Detailed', dark: false, url: `${OFM}/bright`, credit: OFM_CREDIT,
    swatch: { land: '#f8f4f0', water: '#a0c8f0', park: '#c8df9f', road: '#ffffff', roadMajor: '#ffcc88', building: '#e9dfd3' } },
  { id: '3d', label: '3D City', tag: '3D', dark: false, url: `${OFM}/liberty`, extrude: true, credit: OFM_CREDIT,
    swatch: { land: '#f8f4f0', water: '#a0c8f0', park: '#d8e8c8', road: '#ffffff', roadMajor: '#fcd6a4', building: '#cbbfb0' } },
  { id: 'angkor', label: 'Angkor', tag: 'Phaenti', dark: false, url: `${OFM}/liberty`, palette: ANGKOR, credit: OFM_CREDIT,
    swatch: { land: ANGKOR.land, water: ANGKOR.water, park: ANGKOR.park, road: ANGKOR.road, roadMajor: ANGKOR.roadMajor, building: ANGKOR.building } },
  { id: 'mekong-night', label: 'Mekong Night', tag: 'Phaenti', dark: true, url: `${OFM}/liberty`, palette: MEKONG_NIGHT, credit: OFM_CREDIT,
    swatch: { land: MEKONG_NIGHT.land, water: MEKONG_NIGHT.water, park: MEKONG_NIGHT.park, road: MEKONG_NIGHT.road, roadMajor: MEKONG_NIGHT.roadMajor, building: MEKONG_NIGHT.building } },
  { id: 'rice-paddy', label: 'Rice Paddy', tag: 'Phaenti', dark: false, url: `${OFM}/liberty`, palette: RICE_PADDY, credit: OFM_CREDIT,
    swatch: { land: RICE_PADDY.land, water: RICE_PADDY.water, park: RICE_PADDY.park, road: RICE_PADDY.road, roadMajor: RICE_PADDY.roadMajor, building: RICE_PADDY.building } },
  { id: 'dark', label: 'Dark', tag: 'Night', dark: true, url: `${OFM}/dark`, credit: OFM_CREDIT,
    swatch: { land: '#121212', water: '#1d2733', park: '#16201a', road: '#2c2c2c', roadMajor: '#3d3d3d', building: '#1c1c1c' } },
  { id: 'fiord', label: 'Fiord', tag: 'Blue', dark: true, url: `${OFM}/fiord`, credit: OFM_CREDIT,
    swatch: { land: '#45516e', water: '#38435c', park: '#4b5a6e', road: '#5b6b8a', roadMajor: '#7d8fb3', building: '#3f4a63' } },
  { id: 'vt-colorful', label: 'Colorful', tag: 'VersaTiles', dark: false, url: '/styles/versatiles-colorful.json', credit: VT_CREDIT,
    swatch: { land: '#f8f4f0', water: '#bfd9f2', park: '#d9eec5', road: '#ffffff', roadMajor: '#ffcc88', building: '#f2e3d6' } },
  { id: 'vt-natural', label: 'Natural', tag: 'VersaTiles', dark: false, url: '/styles/versatiles-natural.json', credit: VT_CREDIT,
    swatch: { land: '#f2edde', water: '#a6cbed', park: '#cfe0b0', road: '#ffffff', roadMajor: '#e8c48a', building: '#e6dccb' } },
]

export const AUTO_STYLE = 'auto'
export const styleById = (id: string) => MAP_STYLES.find(s => s.id === id) ?? MAP_STYLES[0]!

/** Repaint an OpenMapTiles-schema style with a palette, matching layers by source-layer. */
export function recolor(style: StyleSpecification, P: Palette): StyleSpecification {
  const s = structuredClone(style)
  const majorRe = /motorway|trunk|primary/
  for (const layer of s.layers as (LayerSpecification & { 'source-layer'?: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> })[]) {
    const sl = layer['source-layer']
    const id = layer.id
    layer.paint ??= {}
    const paint = layer.paint
    const set = (k: string, v: unknown) => (paint[k] = v)
    switch (layer.type) {
      case 'background':
        set('background-color', P.land)
        break
      case 'raster':
      case 'hillshade':
        layer.layout = { ...(layer.layout ?? {}), visibility: 'none' }
        break
      case 'fill':
        delete paint['fill-pattern']
        delete paint['fill-outline-color']
        if (sl === 'water') set('fill-color', P.water)
        else if (sl === 'park') set('fill-color', P.park)
        else if (sl === 'landcover') set('fill-color', ['match', ['get', 'class'], ['wood', 'forest'], P.forest, ['sand', 'rock', 'ice'], P.sand, P.park])
        else if (sl === 'landuse') set('fill-color', P.urban)
        else if (sl === 'building') set('fill-color', P.building)
        else if (sl === 'aeroway') set('fill-color', P.urban)
        break
      case 'fill-extrusion':
        set('fill-extrusion-color', P.building)
        break
      case 'line':
        delete paint['line-pattern']
        if (sl === 'waterway') set('line-color', P.waterLine)
        else if (sl === 'transportation') {
          if (/rail|transit|subway/.test(id)) set('line-color', P.rail)
          else if (/casing|outline/.test(id)) set('line-color', P.casing)
          else set('line-color', majorRe.test(id) ? P.roadMajor : P.road)
        } else if (sl === 'boundary') set('line-color', P.boundary)
        else if (sl === 'aeroway') set('line-color', P.road)
        else if (sl === 'building') set('line-color', P.building)
        break
      case 'symbol':
        if (sl === 'poi' && !P.pois) {
          layer.layout = { ...(layer.layout ?? {}), visibility: 'none' }
          break
        }
        if (layer.layout?.['text-field']) {
          const isWater = sl === 'water_name' || /water|ocean|sea|lake|river/.test(id)
          set('text-color', isWater ? P.waterLabel : sl === 'place' ? P.label : P.labelMinor)
          set('text-halo-color', P.halo)
        }
        if (sl === 'transportation_name' && layer.layout?.['icon-image']) set('icon-opacity', 0.85)
        break
    }
  }
  return s
}

/** Font stacks available in a style, so our own labels use fonts its glyph server has. */
export function fontsOf(style: StyleSpecification) {
  const names = new Set<string>()
  for (const l of style.layers as { layout?: Record<string, unknown> }[]) {
    const f = l.layout?.['text-font']
    if (Array.isArray(f)) for (const x of f) if (typeof x === 'string') names.add(x)
  }
  const all = [...names]
  const find = (re: RegExp) => all.find(f => re.test(f))
  const regular = find(/regular/i) ?? all[0] ?? 'Noto Sans Regular'
  return {
    regular: [regular],
    bold: [find(/bold/i) ?? regular],
    italic: [find(/italic/i) ?? regular],
  }
}
