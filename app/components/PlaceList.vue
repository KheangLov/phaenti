<template>
  <div class="px-5 pb-6">
    <!-- Empty state -->
    <div v-if="ready && !places.length" class="flex flex-col items-center px-4 pt-6 pb-10 text-center">
      <motion.div
        class="grid size-20 place-items-center rounded-3xl bg-linear-to-br from-emerald-400 to-violet-500 text-white shadow-lg"
        :animate="{ y: [0, -6, 0] }"
        :transition="{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }"
      >
        <UIcon name="i-lucide-map-pinned" class="size-9" />
      </motion.div>
      <h3 class="mt-5 text-lg font-semibold">Start your map</h3>
      <p class="mt-1.5 max-w-xs text-sm text-(--ui-text-muted)">
        Long-press anywhere on the map, tap <b>+</b>, or search for a place to save it.
      </p>
    </div>

    <TransitionGroup
      v-else
      tag="ul"
      class="relative -mx-2"
      move-class="transition-transform duration-300 ease-out"
      enter-active-class="transition duration-300 ease-out"
      leave-active-class="transition duration-200 ease-in absolute inset-x-0"
      enter-from-class="opacity-0 -translate-y-2"
      leave-to-class="opacity-0 translate-x-6"
    >
      <li v-for="p in visible" :key="p.id" class="cv-row">
        <button
          class="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition active:scale-[0.98] active:bg-(--ui-bg-elevated) hover:bg-(--ui-bg-elevated)/60"
          @click="open(p)"
        >
          <span class="grid size-10 shrink-0 place-items-center rounded-full" :style="{ background: `${STATUS_COLORS[p.status]}1f`, color: STATUS_COLORS[p.status] }">
            <UIcon :name="p.status === 'been' ? 'i-lucide-check' : 'i-lucide-bookmark'" class="size-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">{{ p.name }}</span>
            <span class="block truncate text-[13px] text-(--ui-text-muted)">{{ p.address || formatCoords(p.lat, p.lng) }}</span>
          </span>
          <span class="flex shrink-0 flex-col items-end gap-0.5">
            <span v-if="p.rating" class="flex items-center gap-0.5 text-xs font-semibold text-amber-500">
              <UIcon name="i-lucide-star" class="size-3.5 [&>path]:fill-current" />{{ p.rating }}
            </span>
            <span v-if="p.visitedAt" class="text-[11px] text-(--ui-text-dimmed)">{{ shortDate(p.visitedAt) }}</span>
          </span>
        </button>
      </li>
    </TransitionGroup>

    <div v-if="places.length && !visible.length" class="py-8 text-center text-sm text-(--ui-text-muted)">
      Nothing here yet.
    </div>
    <button v-if="filtered.length > limit" class="mt-2 w-full rounded-xl py-2.5 text-sm font-medium text-(--ui-primary)" @click="limit += 100">
      Show {{ Math.min(100, filtered.length - limit) }} more
    </button>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { STATUS_COLORS, type Place } from '~/utils/db'

const { places, ready } = usePlaces()
const { filter, select, mapApi } = useAppState()

const limit = ref(100)
watch(filter, () => (limit.value = 100))
const filtered = computed(() => places.value.filter(p => filter.value === 'all' || p.status === filter.value))
const visible = computed(() => filtered.value.slice(0, limit.value))

function open(p: Place) {
  select(p.id)
  mapApi.value?.flyTo(p.lng, p.lat, 15)
}

function shortDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
</script>
