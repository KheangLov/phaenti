<template>
  <div class="px-5 pt-1 pb-4">
    <div class="flex items-start gap-3">
      <motion.img
        :key="`${category}`"
        :src="pinDataUrl(category, 'planned')"
        alt=""
        class="-mt-1 h-13 w-11 shrink-0"
        :initial="{ y: -14, opacity: 0, scale: 0.7 }"
        :animate="{ y: 0, opacity: 1, scale: 1 }"
        :transition="{ type: 'spring', stiffness: 520, damping: 20 }"
      />
      <div class="min-w-0 flex-1">
        <input
          v-model="name"
          class="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-(--ui-text-dimmed)"
          :class="draft.loading ? 'animate-pulse' : ''"
          :placeholder="t('place.namePlaceholder')"
          :aria-label="t('place.namePlaceholder')"
        >
        <p class="mt-0.5 truncate text-sm text-(--ui-text-muted)">{{ draft.address }}</p>
        <p v-if="where" class="mt-0.5 flex items-center gap-1 truncate text-xs text-(--ui-text-dimmed)">
          <UIcon name="i-lucide-map" class="size-3.5 shrink-0" />{{ where }}
        </p>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="soft" class="rounded-full" :aria-label="t('place.discard')" @click="closeAll" />
    </div>

    <div class="mt-4">
      <CategoryPicker v-model="category" />
    </div>

    <div class="mt-4 grid grid-cols-2 gap-3">
      <motion.button
        v-for="(s, i) in actions"
        :key="s.status"
        class="flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
        :style="{ background: STATUS_COLORS[s.status], boxShadow: `0 10px 22px -10px ${STATUS_COLORS[s.status]}` }"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 380, damping: 28 }"
        :while-press="{ scale: 0.95 }"
        @click="save(s.status)"
      >
        <UIcon :name="s.icon" class="size-5" />
        {{ t(s.key) }}
      </motion.button>
    </div>

    <div class="mt-4 flex items-center justify-between text-xs text-(--ui-text-dimmed)">
      <span>{{ formatCoords(draft.lat, draft.lng) }}</span>
      <a :href="googleMapsUrl(draft.lat, draft.lng)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-(--ui-text-muted)">
        {{ t('place.openGoogle') }} <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { STATUS_COLORS, type PlaceStatus } from '~/utils/db'
import { categoryOf, type CategoryId } from '~/utils/categories'
import { pinDataUrl } from '~/utils/pins'
import type { Draft } from '~/composables/useAppState'

const props = defineProps<{ draft: Draft }>()
const { add } = usePlaces()
const { closeAll, select, mapApi, draft: draftRef } = useAppState()
const admin = useAdmin()
const toast = useToast()
const { t, pick } = useLang()

const name = ref(props.draft.name)
const category = ref<CategoryId>(props.draft.category ?? 'other')
watch(() => props.draft.name, v => (name.value = v))
watch(() => props.draft.category, (v) => {
  if (v && category.value === 'other') category.value = v
})

watch(category, (v) => {
  if (draftRef.value && draftRef.value.category !== v) draftRef.value = { ...draftRef.value, category: v }
})

const where = computed(() => {
  const a = admin.lookupReady.value ? admin.locate(props.draft.lat, props.draft.lng) : null
  if (!a) return ''
  return [admin.area(a.c), admin.area(a.d), admin.area(a.p)].filter(Boolean).map(x => pick(x!.name, x!.km)).join(' · ')
})

const actions = [
  { status: 'been' as const, key: 'status.been', icon: 'i-lucide-check-circle-2' },
  { status: 'planned' as const, key: 'status.planned', icon: 'i-lucide-heart' },
]

async function save(status: PlaceStatus) {
  const d = props.draft
  const p = await add({ name: name.value || t('place.untitled'), address: d.address, lat: d.lat, lng: d.lng, status, category: category.value, source: d.source })
  mapApi.value?.pulse(p.lng, p.lat, categoryOf(p.category).color)
  if (navigator.vibrate) navigator.vibrate([8, 40, 8])
  select(p.id)
  toast.add({ title: status === 'been' ? t('toast.addedBeen') : t('toast.addedPlanned'), icon: 'i-lucide-map-pin-check', color: status === 'been' ? 'primary' : 'secondary', duration: 2200 })
}
</script>
