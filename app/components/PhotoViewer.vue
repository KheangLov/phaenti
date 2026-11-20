<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="viewer && place && photos.length"
        key="viewer"
        class="fixed inset-0 z-[60] flex flex-col bg-black text-white"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.2 }"
        role="dialog"
        :aria-label="place.name"
      >
        <div class="pt-safe flex items-center gap-2 px-3 pb-2">
          <button class="grid size-11 place-items-center rounded-full bg-white/10 active:scale-90 transition" :aria-label="t('place.close')" @click="viewer = null">
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
          <div class="min-w-0 flex-1 text-center">
            <p class="truncate text-sm font-semibold">{{ place.name }}</p>
            <p class="text-xs text-white/60">{{ index + 1 }} / {{ photos.length }}</p>
          </div>
          <span class="size-11" />
        </div>

        <div ref="scroller" class="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]" @scroll.passive="onScroll">
          <div v-for="ph in photos" :key="ph" class="grid w-full shrink-0 snap-center place-items-center px-1">
            <ViewerImage :photo="ph" :alt="place.name" />
          </div>
        </div>

        <div class="pb-safe grid grid-cols-3 gap-2 px-4 pt-3">
          <button class="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-2.5 text-xs font-medium active:scale-95 transition disabled:opacity-40" :disabled="index === 0" @click="makeCover">
            <UIcon name="i-lucide-star" class="size-5" />{{ t('photo.makeCover') }}
          </button>
          <a
            v-if="!isLocalPhoto(current)"
            :href="current"
            target="_blank"
            rel="noopener noreferrer"
            class="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-2.5 text-xs font-medium active:scale-95 transition"
          >
            <UIcon name="i-lucide-external-link" class="size-5" />{{ t('photo.openLink') }}
          </a>
          <button v-else class="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-2.5 text-xs font-medium active:scale-95 transition" @click="sharePhoto">
            <UIcon name="i-lucide-share" class="size-5" />{{ t('place.share') }}
          </button>
          <button class="flex flex-col items-center gap-1 rounded-2xl bg-red-500/25 py-2.5 text-xs font-medium text-red-200 active:scale-95 transition" @click="del">
            <UIcon name="i-lucide-trash-2" class="size-5" />{{ t('photo.remove') }}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { isLocalPhoto, localId, photoSrc } from '~/utils/photos'
import { db } from '~/utils/db'

const ViewerImage = defineComponent({
  props: { photo: { type: String, required: true }, alt: String },
  setup(p) {
    const src = ref<string | null>(null)
    watchEffect(async () => (src.value = await photoSrc(p.photo)))
    return () => src.value
      ? h('img', { src: src.value, alt: p.alt, referrerpolicy: 'no-referrer', class: 'max-h-full max-w-full rounded-lg object-contain select-none', draggable: false })
      : h('span', { class: 'size-8 rounded-full border-2 border-white/40 border-t-transparent animate-spin' })
  },
})

const { photoViewer: viewer } = useAppState()
const { allPlaces, update } = usePlaces()
const { t } = useLang()
const toast = useToast()

const place = computed(() => (viewer.value ? allPlaces.value.find(p => p.id === viewer.value!.placeId) ?? null : null))
const photos = computed(() => place.value?.photos ?? [])
const index = ref(0)
const current = computed(() => photos.value[index.value] ?? '')
const scroller = ref<HTMLElement>()

watch(() => viewer.value?.index, async (i) => {
  if (i == null) return
  index.value = i
  await nextTick()
  await nextTick()
  scroller.value?.scrollTo({ left: i * scroller.value.clientWidth, behavior: 'instant' as ScrollBehavior })
}, { immediate: true })
watch(photos, (list) => {
  if (viewer.value && !list.length) viewer.value = null
  else if (index.value >= list.length) index.value = Math.max(0, list.length - 1)
})

function onScroll() {
  const el = scroller.value
  if (el) index.value = Math.round(el.scrollLeft / el.clientWidth)
}

async function makeCover() {
  if (!place.value || index.value === 0) return
  const list = [...photos.value]
  const [ph] = list.splice(index.value, 1)
  await update(place.value.id, { photos: [ph!, ...list] })
  haptic('success')
  index.value = 0
  scroller.value?.scrollTo({ left: 0, behavior: 'smooth' })
}

async function del() {
  const p = place.value
  if (!p) return
  const before = [...photos.value]
  await update(p.id, { photos: before.filter((_, i) => i !== index.value) })
  haptic('tap')
  toast.add({
    title: t('photo.removed'),
    icon: 'i-lucide-trash-2',
    duration: 5000,
    actions: [{ label: t('toast.undo'), color: 'neutral', variant: 'outline', onClick: () => void update(p.id, { photos: before }) }],
  })
}

async function sharePhoto() {
  const rec = await db.photos.get(localId(current.value))
  if (!rec) return
  const file = new File([rec.blob], `${place.value?.name || 'photo'}.${rec.blob.type.split('/')[1] || 'jpg'}`, { type: rec.blob.type })
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: place.value?.name })
  } catch { /* cancelled */ }
}
</script>
