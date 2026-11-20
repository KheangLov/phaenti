<template>
  <div>
    <!-- Photos -->
    <div v-if="photos.length" class="-mx-5 overflow-x-auto overscroll-x-contain px-5 scroll-px-5 snap-x snap-mandatory [scrollbar-width:none]">
      <TransitionGroup tag="div" class="flex w-max gap-2" move-class="transition-transform duration-300" enter-from-class="opacity-0 scale-90" enter-active-class="transition duration-300">
        <button
          v-for="(ph, i) in photos"
          :key="ph"
          class="relative h-44 snap-start overflow-hidden rounded-2xl active:scale-[0.98] transition"
          :class="photos.length === 1 ? 'w-[calc(100vw-7.5rem)] max-w-md' : 'w-64'"
          :aria-label="t('photo.open')"
          @click="photoViewer = { placeId: place.id, index: i }"
        >
          <PlacePhoto :photo="ph" :alt="place.name" class="size-full" />
          <span v-if="i === 0 && photos.length > 1" class="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
            {{ t('photo.cover') }}
          </span>
        </button>
        <button
          key="__add"
          class="flex h-44 w-24 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-(--ui-border-accented) text-xs font-medium text-(--ui-text-muted) active:scale-95 transition"
          @click="adding = !adding"
        >
          <UIcon name="i-lucide-image-plus" class="size-6" />
          {{ t('photo.add') }}
        </button>
      </TransitionGroup>
    </div>

    <!-- Add: upload or link -->
    <div v-if="!photos.length || adding" class="grid grid-cols-2 gap-2" :class="photos.length ? 'mt-2' : ''">
      <button
        class="flex h-14 items-center justify-center gap-2 rounded-2xl bg-(--ui-bg-elevated) text-sm font-medium active:scale-95 transition disabled:opacity-60"
        :disabled="busy"
        @click="fileInput?.click()"
      >
        <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-camera'" class="size-5 text-pink-500" :class="busy ? 'animate-spin' : ''" />
        {{ t('photo.upload') }}
      </button>
      <button
        class="flex h-14 items-center justify-center gap-2 rounded-2xl bg-(--ui-bg-elevated) text-sm font-medium active:scale-95 transition"
        :class="linkOpen ? 'ring-2 ring-sky-500' : ''"
        @click="toggleLink"
      >
        <UIcon name="i-lucide-link" class="size-5 text-sky-500" />
        {{ t('photo.link') }}
      </button>
    </div>
    <motion.form
      v-if="linkOpen"
      class="mt-2 flex gap-2"
      :initial="{ opacity: 0, y: -6 }"
      :animate="{ opacity: 1, y: 0 }"
      @submit.prevent="addLink"
    >
      <input
        ref="linkInput"
        v-model="link"
        type="url"
        inputmode="url"
        enterkeyhint="done"
        autocomplete="off"
        :placeholder="t('photo.linkPlaceholder')"
        class="h-12 min-w-0 flex-1 rounded-2xl bg-(--ui-bg-elevated) px-4 text-base outline-none placeholder:text-(--ui-text-dimmed)"
      >
      <UButton type="submit" size="xl" class="rounded-2xl" :loading="checking" :disabled="!link.trim()">{{ t('photo.addLink') }}</UButton>
    </motion.form>

    <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles">
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import type { Place } from '~/utils/db'
import { checkImageLink, cleanPhotoLink, savePhotoFile } from '~/utils/photos'

const props = defineProps<{ place: Place }>()
const { update } = usePlaces()
const { photoViewer } = useAppState()
const { t } = useLang()
const toast = useToast()

const photos = computed(() => props.place.photos ?? [])
const adding = ref(false)
const busy = ref(false)
const linkOpen = ref(false)
const link = ref('')
const checking = ref(false)
const fileInput = ref<HTMLInputElement>()
const linkInput = ref<HTMLInputElement>()
watch(() => props.place.id, () => {
  adding.value = false
  linkOpen.value = false
  link.value = ''
})

async function toggleLink() {
  linkOpen.value = !linkOpen.value
  if (!linkOpen.value) return
  // Pre-fill from the clipboard when it holds a link (only if the browser allows it silently)
  try {
    const clip = (await navigator.clipboard?.readText?.())?.trim()
    if (clip && !link.value && cleanPhotoLink(clip)) link.value = clip
  } catch { /* not allowed */ }
  await nextTick()
  linkInput.value?.focus()
}

async function addPhotos(refs: string[]) {
  await update(props.place.id, { photos: [...photos.value, ...refs].slice(0, 30) })
  adding.value = false
  haptic('success')
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
  input.value = ''
  if (!files.length) return
  busy.value = true
  const refs: string[] = []
  let failed = 0
  for (const f of files.slice(0, 20)) {
    try { refs.push(await savePhotoFile(f)) } catch { failed++ }
  }
  busy.value = false
  if (refs.length) await addPhotos(refs)
  if (failed) toast.add({ title: t('photo.uploadFail', { n: failed }), icon: 'i-lucide-image-off', color: 'warning' })
}

async function addLink() {
  const url = cleanPhotoLink(link.value)
  if (!url) {
    toast.add({ title: t('photo.badLink'), icon: 'i-lucide-link-2-off', color: 'warning' })
    return
  }
  if (photos.value.includes(url)) {
    linkOpen.value = false
    link.value = ''
    return
  }
  checking.value = true
  const ok = await checkImageLink(url)
  checking.value = false
  if (!ok) {
    toast.add({ title: t('photo.notImage'), description: t('photo.notImageHint'), icon: 'i-lucide-image-off', color: 'warning' })
    return
  }
  linkOpen.value = false
  link.value = ''
  await addPhotos([url])
}
</script>
