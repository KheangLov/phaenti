// Build static vector tiles (z4–z11) for Cambodia admin boundaries.
// Usage: node build_tiles.mjs <in dir> <out dir>
import fs from 'node:fs'
import path from 'node:path'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'

const [inDir, outDir] = process.argv.slice(2)
const read = f => JSON.parse(fs.readFileSync(path.join(inDir, f), 'utf8'))
const MINZ = 4, MAXZ = 11

const labels = read('labels.geojson')
const layers = {
  province: { data: read('adm1.geojson'), minz: 4 },
  district: { data: read('adm2.geojson'), minz: 7 },
  commune: { data: read('adm3.geojson'), minz: 9 },
  label_province: { data: { type: 'FeatureCollection', features: labels.features.filter(f => f.properties.level === 1) }, minz: 4 },
  label_district: { data: { type: 'FeatureCollection', features: labels.features.filter(f => f.properties.level === 2) }, minz: 7 },
  label_commune: { data: { type: 'FeatureCollection', features: labels.features.filter(f => f.properties.level === 3) }, minz: 9 },
}

// Only keep the properties the map needs
for (const l of Object.values(layers)) {
  for (const f of l.data.features) {
    const p = f.properties
    f.properties = { code: p.code, name: p.name, ...(p.area != null ? { area: p.area } : {}) }
  }
  l.index = new geojsonvt(l.data, { maxZoom: MAXZ, indexMaxZoom: MAXZ, indexMaxPoints: 0, tolerance: 2.5, extent: 4096, buffer: 64 })
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}
const BBOX = [102.2, 10.3, 107.7, 14.8]

let count = 0, bytes = 0
for (let z = MINZ; z <= MAXZ; z++) {
  const x0 = lon2x(BBOX[0], z), x1 = lon2x(BBOX[2], z)
  const y0 = lat2y(BBOX[3], z), y1 = lat2y(BBOX[1], z)
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const out = {}
      for (const [name, l] of Object.entries(layers)) {
        if (z < l.minz) continue
        const t = l.index.getTile(z, x, y)
        if (t && t.features.length) out[name] = t
      }
      if (!Object.keys(out).length) continue
      const buf = vtpbf.fromGeojsonVt(out, { version: 2 })
      const dir = path.join(outDir, String(z), String(x))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${y}.pbf`), buf)
      count++
      bytes += buf.length
    }
  }
}
console.log(`tiles: ${count}, ${(bytes / 1024 / 1024).toFixed(2)} MB`)
