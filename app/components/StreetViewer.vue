<template>
  <AnimatePresence>
    <motion.div
      v-if="streetView"
      key="street"
      class="fixed inset-x-0 top-0 z-[45] flex flex-col overflow-hidden rounded-b-[28px] bg-black shadow-2xl"
      :style="{ height: '62vh' }"
      :initial="{ y: '-100%' }"
      :animate="{ y: 0 }"
      :exit="{ y: '-100%' }"
      :transition="{ type: 'spring', stiffness: 380, damping: 38 }"
      role="dialog"
      :aria-label="t('street.title')"
    >
      <div ref="box" class="absolute inset-0" />
      <div v-if="loading" class="absolute inset-0 grid place-items-center text-white/80">
        <span class="size-8 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
      </div>
      <p v-if="failed" class="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/80">{{ t('street.failed') }}</p>

      <!-- Top bar -->
      <div class="pt-safe pointer-events-none relative flex items-start justify-between gap-2 px-3">
        <button class="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur active:scale-90 transition" :aria-label="t('place.close')" @click="streetView = null">
          <UIcon name="i-lucide-x" class="size-5" />
        </button>
        <div class="pointer-events-auto flex items-center gap-2">
          <span v-if="captured" class="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">{{ captured }}</span>
          <a
            :href="googleUrl"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
          >
            <UIcon name="i-lucide-external-link" class="size-3.5" /> Google
          </a>
        </div>
      </div>
      <a href="https://www.mapillary.com" target="_blank" rel="noopener" class="absolute bottom-2 left-3 text-[10px] text-white/70">© Mapillary</a>
    </motion.div>
  </AnimatePresence>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { googleStreetViewUrl } from '~/composables/useKeys'

const { streetView, mapApi } = useAppState()
const { mapillary } = useKeys()
const { t, locale } = useLang()

const box = ref<HTMLElement>()
const loading = ref(false)
const failed = ref(false)
const capturedAt = ref<number | null>(null)
let viewer: { moveTo: (id: string) => Promise<unknown>; remove: () => void; on: (e: string, f: (ev: any) => void) => void } | null = null
let current = ''

const captured = computed(() => capturedAt.value ? new Date(capturedAt.value).toLocaleDateString(locale.value, { month: 'short', year: 'numeric' }) : '')
const googleUrl = computed(() => streetView.value ? googleStreetViewUrl(streetView.value.lat, streetView.value.lng) : '#')

watch(() => streetView.value?.imageId, async (id) => {
  if (!id) {
    viewer?.remove()
    viewer = null
    current = ''
    return
  }
  if (id === current) return
  current = id
  failed.value = false
  await nextTick()
  if (viewer) {
    viewer.moveTo(id).catch(() => (failed.value = true))
    return
  }
  loading.value = true
  try {
    // ~1 MB, so only downloaded the first time you open a street photo
    const [{ Viewer }] = await Promise.all([import('mapillary-js'), import('mapillary-js/dist/mapillary.css')])
    if (!box.value || !streetView.value) return
    viewer = new Viewer({
      accessToken: mapillary.value,
      container: box.value,
      imageId: id,
      component: { cover: false, bearing: { size: 'small' as never } },
    }) as unknown as typeof viewer
    viewer!.on('image', (e: { image: { id: string; lngLat: { lat: number; lng: number }; capturedAt: number } }) => {
      current = e.image.id
      capturedAt.value = e.image.capturedAt
      // Walking through photos moves the green dot on the map
      streetView.value = { imageId: e.image.id, lat: e.image.lngLat.lat, lng: e.image.lngLat.lng }
      // Keep the dot in the strip of map below the viewer
      mapApi.value?.flyTo(e.image.lngLat.lng, e.image.lngLat.lat, Math.max(mapApi.value.zoom(), 16), { top: Math.round(window.innerHeight * 0.62) + 20, bottom: 40 })
    })
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => viewer?.remove())
</script>
