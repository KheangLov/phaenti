<template>
  <div class="px-5 pt-1 pb-4">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <input
          v-model="name"
          class="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-(--ui-text-dimmed)"
          :class="draft.loading ? 'animate-pulse' : ''"
          placeholder="Name this place"
          aria-label="Place name"
        >
        <p class="mt-0.5 truncate text-sm text-(--ui-text-muted)">{{ draft.address }}</p>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="soft" class="rounded-full" aria-label="Discard" @click="closeAll" />
    </div>

    <div class="mt-5 grid grid-cols-2 gap-3">
      <motion.button
        v-for="(s, i) in actions"
        :key="s.status"
        class="flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-md"
        :style="{ background: STATUS_COLORS[s.status], boxShadow: `0 8px 20px -8px ${STATUS_COLORS[s.status]}` }"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 380, damping: 28 }"
        :while-press="{ scale: 0.95 }"
        @click="save(s.status)"
      >
        <UIcon :name="s.icon" class="size-5" />
        {{ s.label }}
      </motion.button>
    </div>

    <div class="mt-4 flex items-center justify-between text-xs text-(--ui-text-dimmed)">
      <span>{{ formatCoords(draft.lat, draft.lng) }}</span>
      <a :href="googleMapsUrl(draft.lat, draft.lng)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-(--ui-text-muted)">
        Open in Google Maps <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { STATUS_COLORS, type PlaceStatus } from '~/utils/db'
import type { Draft } from '~/composables/useAppState'

const props = defineProps<{ draft: Draft }>()
const { add } = usePlaces()
const { closeAll, select, mapApi } = useAppState()
const toast = useToast()

const name = ref(props.draft.name)
watch(() => props.draft.name, v => (name.value = v))

const actions = [
  { status: 'been' as const, label: 'Been here', icon: 'i-lucide-check-circle-2' },
  { status: 'planned' as const, label: 'Want to go', icon: 'i-lucide-bookmark-plus' },
]

async function save(status: PlaceStatus) {
  const d = props.draft
  const p = await add({ name: name.value, address: d.address, lat: d.lat, lng: d.lng, status, source: d.source })
  mapApi.value?.pulse(p.lng, p.lat, STATUS_COLORS[status])
  if (navigator.vibrate) navigator.vibrate([8, 40, 8])
  select(p.id)
  toast.add({ title: status === 'been' ? 'Added to places you’ve been' : 'Added to your wishlist', icon: 'i-lucide-map-pin-check', color: status === 'been' ? 'primary' : 'secondary', duration: 2200 })
}
</script>
