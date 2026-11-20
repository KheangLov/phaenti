<template>
  <div class="px-5 pb-6">
    <PersonalShortcuts class="mb-4" />

    <!-- Discover famous places -->
    <motion.button
      v-if="discoverLeft > 0"
      class="relative mb-4 flex w-full items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-br from-amber-400/20 via-rose-400/15 to-violet-500/20 p-3 text-left active:scale-[0.98] transition"
      :initial="{ opacity: 0, y: 8 }"
      :animate="{ opacity: 1, y: 0 }"
      @click="discoverOpen = true"
    >
      <div class="relative h-14 w-20 shrink-0">
        <div
          v-for="(p, i) in discoverPreview"
          :key="p.id"
          class="absolute top-0 size-14 overflow-hidden rounded-2xl shadow-md ring-2 ring-(--ui-bg)"
          :style="{ left: `${i * 12}px`, transform: `rotate(${(i - 1) * 6}deg)`, zIndex: 3 - i }"
        >
          <PlacePhoto :photo="p.photo!" class="size-full" />
        </div>
        <div v-if="!discoverPreview.length" class="grid size-14 place-items-center rounded-2xl bg-linear-to-br from-amber-400 to-rose-500 text-white">
          <UIcon name="i-lucide-sparkles" class="size-6" />
        </div>
      </div>
      <span class="min-w-0 flex-1">
        <span class="block text-[15px] font-semibold">{{ t('discover.bannerTitle') }}</span>
        <span class="block text-[13px] text-(--ui-text-muted)">{{ t('discover.bannerBody', { n: discoverLeft }) }}</span>
      </span>
      <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-(--ui-text-dimmed)" />
    </motion.button>
    <ExplorerStats v-if="admin.lookupReady.value && places.some(p => !isPersonal(p.category))" class="mb-4" />

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
      <UButton class="mt-5 rounded-2xl" size="lg" icon="i-lucide-sparkles" color="primary" variant="soft" @click="discoverOpen = true">
        {{ t('menu.discover') }}
      </UButton>
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
          <span v-if="p.photos?.length" class="relative shrink-0">
            <PlacePhoto :photo="p.photos[0]!" class="size-12 rounded-2xl" />
            <img :src="pinDataUrl(p.category, p.status)" alt="" class="absolute -bottom-1 -right-1.5 h-6 w-5 drop-shadow" loading="lazy">
          </span>
          <img v-else :src="pinDataUrl(p.category, p.status)" alt="" class="h-11 w-9 shrink-0" loading="lazy">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">{{ p.name }}</span>
            <span class="block truncate text-[13px] text-(--ui-text-muted)">{{ subtitle(p) }}</span>
          </span>
          <span class="flex shrink-0 flex-col items-end gap-0.5">
            <span v-if="p.rating" class="flex items-center gap-0.5 text-xs font-semibold text-amber-500">
              <UIcon name="i-lucide-star" class="size-3.5 [&>path]:fill-current" />{{ p.rating }}
            </span>
            <span v-if="p.visitedAt && !isPersonal(p.category)" class="text-[11px] text-(--ui-text-dimmed)">{{ shortDate(p.visitedAt) }}</span>
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
import { categoryOf, matchesFilter, isPersonal } from '~/utils/categories'
import { pinDataUrl } from '~/utils/pins'
import { placeAdmin } from '~/composables/useAdmin'

const { places, ready } = usePlaces()
const { filter, select, mapApi, discoverOpen } = useAppState()
const { places: discover } = useDiscover()
const discoverLeft = computed(() => {
  const ids = new Set(places.value.map(p => p.discoverId).filter(Boolean))
  return discover.value.filter(d => !ids.has(d.id)).length
})
const discoverPreview = computed(() => discover.value.filter(d => d.photo).slice(0, 3))
const admin = useAdmin()
const { t, pick, catLabel, locale } = useLang()

const limit = ref(100)
watch(filter, () => (limit.value = 100))
const filtered = computed(() => places.value.filter(p => matchesFilter(p, filter.value)))
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
