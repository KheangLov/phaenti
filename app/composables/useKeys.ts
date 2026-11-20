// Free API keys for the optional live layers. Set them once at build time
// (NUXT_PUBLIC_TOMTOM_KEY / NUXT_PUBLIC_MAPILLARY_TOKEN) or paste them in the app;
// pasted keys stay on this device only.
const tomtom = ref('')
const mapillary = ref('')
let ready = false

function init() {
  if (ready || !import.meta.client) return
  ready = true
  const cfg = useRuntimeConfig().public as { tomtomKey?: string; mapillaryToken?: string }
  try {
    tomtom.value = localStorage.getItem('phaenti:key-tomtom') || cfg.tomtomKey || ''
    mapillary.value = localStorage.getItem('phaenti:key-mapillary') || cfg.mapillaryToken || ''
  } catch {
    tomtom.value = cfg.tomtomKey || ''
    mapillary.value = cfg.mapillaryToken || ''
  }
  watch(tomtom, v => save('phaenti:key-tomtom', v))
  watch(mapillary, v => save('phaenti:key-mapillary', v))
}
function save(k: string, v: string) {
  try { v ? localStorage.setItem(k, v.trim()) : localStorage.removeItem(k) } catch { /* ignore */ }
}

export function useKeys() {
  init()
  return { tomtom, mapillary }
}

/** Google Maps fallbacks: open Street View / traffic there (free, it's just a link) */
export const googleStreetViewUrl = (lat: number, lng: number) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
export const googleTrafficUrl = (lat: number, lng: number, zoom: number) => `https://www.google.com/maps/@${lat.toFixed(5)},${lng.toFixed(5)},${Math.round(zoom)}z/data=!5m1!1e1`
