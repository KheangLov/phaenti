<template>
  <div class="px-5 pb-6">
    <ExplorerStats v-if="admin.lookupReady.value && places.length" class="mb-4" />

    <!-- Empty state -->
    <div v-if="ready && !places.length" class="flex flex-col items-center px-4 pt-6 pb-10 text-center">
      <motion.div
        class="grid size-20 place-items-center rounded-3xl bg-linear-to-br from-emerald-400 to-violet-500 text-white shadow-lg"
        :animate="{ y: [0, -6, 0] }"
        :transition="{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }"
      >
        <UIcon name="i-lucide-map-pinned" class="size-9" />
      </motion.div>
      <h3 class="mt-5 text-lg font-semibold">{{ t('list.emptyTitle') }}</h3>
      <p class="mt-1.5 max-w-xs text-sm text-(--ui-text-muted)">
        {{ t('list.emptyBody') }}
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
          class="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition active:scale-[0.98] active:bg-(--ui-bg-elevated) hover:bg-(--ui-bg-elevated)/60"
          @click="open(p)"
        >
          <img :src="pinDataUrl(p.category, p.status)" alt="" class="h-11 w-9 shrink-0" loading="lazy">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">{{ p.name }}</span>
            <span class="block truncate text-[13px] text-(--ui-text-muted)">{{ subtitle(p) }}</span>
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
      {{ t('list.nothing') }}
    </div>
    <button v-if="filtered.length > limit" class="mt-2 w-full rounded-xl py-2.5 text-sm font-medium text-(--ui-primary)" @click="limit += 100">
      {{ t('list.showMore', { n: Math.min(100, filtered.length - limit) }) }}
    </button>

  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import type { Place } from '~/utils/db'
import { categoryOf } from '~/utils/categories'
import { pinDataUrl } from '~/utils/pins'
import { placeAdmin } from '~/composables/useAdmin'

const { places, ready } = usePlaces()
const { filter, select, mapApi } = useAppState()
const admin = useAdmin()
const { t, pick, catLabel, locale } = useLang()

const limit = ref(100)
watch(filter, () => (limit.value = 100))
const filtered = computed(() => places.value.filter(p => filter.value === 'all' || p.status === filter.value))
const visible = computed(() => filtered.value.slice(0, limit.value))

function subtitle(p: Place) {
  const a = placeAdmin.value.get(p.id)
  const where = a ? [admin.area(a.d), admin.area(a.p)].filter(Boolean).map(x => pick(x!.name, x!.km)).join(', ') : ''
  return [catLabel(p.category, categoryOf(p.category).label), where || p.address || formatCoords(p.lat, p.lng)].filter(Boolean).join(' · ')
}

function open(p: Place) {
  select(p.id)
  mapApi.value?.flyTo(p.lng, p.lat, 15)
}

function shortDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(locale.value, { month: 'short', year: 'numeric' })
}
</script>
