<template>
  <UDrawer v-model:open="open" :title="t('discover.title')" :description="t('discover.desc')">
    <template #body>
      <div class="pb-safe">
        <!-- Save all -->
        <motion.button
          v-if="unsaved.length"
          class="relative flex w-full items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-br from-violet-600 to-fuchsia-500 p-4 text-left text-white shadow-lg disabled:opacity-70"
          :while-press="{ scale: 0.97 }"
          :disabled="saving"
          @click="saveAll"
        >
          <div class="flex -space-x-3">
            <div v-for="p in previewPhotos" :key="p.id" class="size-11 overflow-hidden rounded-full ring-2 ring-white/80">
              <PlacePhoto :photo="p.photo!" class="size-full" />
            </div>
          </div>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-semibold">{{ t('discover.saveAll', { n: unsaved.length }) }}</span>
            <span class="block text-xs text-white/80">{{ t('discover.saveAllHint') }}</span>
          </span>
          <UIcon :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-bookmark-plus'" class="size-6 shrink-0" :class="saving ? 'animate-spin' : ''" />
        </motion.button>
        <div v-else-if="list.length" class="flex items-center gap-2 rounded-3xl bg-emerald-500/12 p-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <UIcon name="i-lucide-badge-check" class="size-5" /> {{ t('discover.allSaved') }}
        </div>

        <!-- Category filter -->
        <div class="-mx-4 mt-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]">
          <div class="flex w-max gap-1.5">
            <button
              v-for="c in cats"
              :key="c.id"
              class="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors"
              :class="cat === c.id ? 'bg-(--ui-text-highlighted) text-(--ui-bg)' : 'bg-(--ui-bg-elevated) text-(--ui-text-muted)'"
              @click="cat = c.id"
            >
              <UIcon v-if="c.icon" :name="`i-lucide-${c.icon}`" class="size-4" :style="cat === c.id ? undefined : { color: c.color }" />
              {{ c.label }} <span class="opacity-60">{{ c.n }}</span>
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="!list.length && loading" class="mt-4 grid grid-cols-2 gap-3">
          <div v-for="i in 6" :key="i" class="aspect-[4/5] animate-pulse rounded-3xl bg-(--ui-bg-elevated)" />
        </div>

        <!-- Cards -->
        <div class="mt-4 grid grid-cols-2 gap-3">
          <motion.div
            v-for="(p, i) in shown"
            :key="p.id"
            class="group relative overflow-hidden rounded-3xl bg-(--ui-bg-elevated)"
            :initial="{ opacity: 0, y: 14 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ delay: Math.min(i, 10) * 0.035, type: 'spring', stiffness: 380, damping: 30 }"
          >
            <button class="block w-full text-left" @click="show(p)">
              <div class="relative aspect-[4/3]">
                <PlacePhoto v-if="p.photo" :photo="p.photo" :alt="pick(p.name, p.km)" class="size-full" />
                <div v-else class="grid size-full place-items-center" :style="{ background: `linear-gradient(135deg, ${categoryOf(p.category).color}, ${categoryOf(p.category).color2})` }">
                  <UIcon :name="`i-lucide-${categoryOf(p.category).icon}`" class="size-10 text-white/90" />
                </div>
                <span class="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  <UIcon :name="`i-lucide-${categoryOf(p.category).icon}`" class="size-3" />{{ catLabel(p.category, categoryOf(p.category).label) }}
                </span>
              </div>
              <div class="px-3 pt-2 pb-3">
                <p class="line-clamp-2 text-sm font-semibold leading-snug">{{ pick(p.name, p.km) }}</p>
                <p class="mt-0.5 line-clamp-2 text-xs text-(--ui-text-muted)">{{ isKm ? p.blurbKm : p.blurb }}</p>
              </div>
            </button>
            <motion.button
              class="absolute right-2 top-2 grid size-9 place-items-center rounded-full shadow-md"
              :class="savedIds.has(p.id) ? 'bg-emerald-500 text-white' : 'bg-white/90 text-violet-600 dark:bg-zinc-900/85 dark:text-violet-300'"
              :aria-label="savedIds.has(p.id) ? t('discover.saved') : t('discover.save')"
              :while-press="{ scale: 0.85 }"
              @click="toggle(p)"
            >
              <motion.span :key="String(savedIds.has(p.id))" :initial="{ scale: 0.4, rotate: -45 }" :animate="{ scale: 1, rotate: 0 }" :transition="{ type: 'spring', stiffness: 600, damping: 18 }">
                <UIcon :name="savedIds.has(p.id) ? 'i-lucide-check' : 'i-lucide-plus'" class="size-5" />
              </motion.span>
            </motion.button>
          </motion.div>
        </div>

        <p class="mt-5 text-center text-xs text-(--ui-text-dimmed)">
          {{ failed ? t('discover.noPhotos') : t('discover.credit') }}
        </p>
      </div>
    </template>
  </UDrawer>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import type { DiscoverPlace } from '~/composables/useDiscover'
import { categoryOf, type CategoryId } from '~/utils/categories'
import { haversineKm } from '~/utils/geo'

const { discoverOpen: open, select, filter, mapApi, closeAll } = useAppState()
const { places: list, loading, failed } = useDiscover()
const { places, add, addMany, remove } = usePlaces()
const { t, pick, isKm, catLabel } = useLang()
const toast = useToast()

const cat = ref<'all' | CategoryId>('all')
const saving = ref(false)

/** Discover id → your saved place (by link, or same name within 300 m if you added it yourself) */
const savedMap = computed(() => {
  const m = new Map<string, string>()
  for (const d of list.value) {
    const hit = places.value.find(p => p.discoverId === d.id)
      ?? places.value.find(p => (p.name === d.name || p.name === d.km) && haversineKm([p.lng, p.lat], [d.lng, d.lat]) < 0.3)
    if (hit) m.set(d.id, hit.id)
  }
  return m
})
const savedIds = computed(() => new Set(savedMap.value.keys()))
const unsaved = computed(() => list.value.filter(p => !savedIds.value.has(p.id)))
const previewPhotos = computed(() => unsaved.value.filter(p => p.photo).slice(0, 3))

const cats = computed(() => {
  const counts = new Map<CategoryId, number>()
  for (const p of list.value) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  return [
    { id: 'all' as const, label: t('app.all'), n: list.value.length, icon: '', color: '' },
    ...[...counts].sort((a, b) => b[1] - a[1]).map(([id, n]) => {
      const c = categoryOf(id)
      return { id, label: catLabel(id, c.label), n, icon: c.icon, color: c.color }
    }),
  ]
})
const shown = computed(() => (cat.value === 'all' ? list.value : list.value.filter(p => p.category === cat.value)))

function toNew(p: DiscoverPlace) {
  return {
    name: isKm.value ? p.km : p.name,
    lat: p.lat,
    lng: p.lng,
    status: 'planned' as const,
    category: p.category,
    notes: isKm.value ? p.blurbKm : p.blurb,
    photos: p.photo ? [p.photo] : [],
    discoverId: p.id,
    tags: ['discover'],
    source: 'discover' as const,
  }
}

async function toggle(p: DiscoverPlace) {
  const existing = savedMap.value.get(p.id)
  if (existing) {
    // Only un-save what Discover added; your own entries are left alone
    const mine = places.value.find(x => x.id === existing)
    if (mine?.discoverId !== p.id) {
      select(existing)
      open.value = false
      return
    }
    const old = await remove(existing)
    haptic('tap')
    if (old) toast.add({ title: t('toast.deleted', { name: old.name }), icon: 'i-lucide-bookmark-minus', duration: 2500 })
    return
  }
  await add(toNew(p))
  haptic('success')
  mapApi.value?.pulse(p.lng, p.lat, '#8b5cf6')
}

async function saveAll() {
  if (!unsaved.value.length) return
  saving.value = true
  const added = await addMany(unsaved.value.map(toNew))
  saving.value = false
  haptic('success')
  open.value = false
  closeAll()
  filter.value = 'planned'
  setTimeout(() => mapApi.value?.fitAll(), 350)
  toast.add({
    title: t('discover.savedN', { n: added.length }),
    icon: 'i-lucide-bookmark-check',
    color: 'primary',
    duration: 6000,
    actions: [{
      label: t('toast.undo'),
      color: 'neutral',
      variant: 'outline',
      onClick: () => { for (const p of added) void remove(p.id) },
    }],
  })
}

function show(p: DiscoverPlace) {
  open.value = false
  const id = savedMap.value.get(p.id)
  if (id) select(id)
  mapApi.value?.flyTo(p.lng, p.lat, 15)
  if (!id) setTimeout(() => mapApi.value?.pulse(p.lng, p.lat, '#8b5cf6'), 900)
}
</script>
