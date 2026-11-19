<template>
  <div>
    <p v-if="title" class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--ui-text-dimmed)">{{ t('personal.yourPlaces') }}</p>
    <div class="grid grid-cols-4 gap-2">
      <motion.button
        v-for="(c, i) in rows"
        :key="c.id"
        class="flex flex-col items-center gap-1.5 rounded-2xl bg-(--ui-bg-elevated) px-1 py-3"
        :class="filter === c.id ? 'ring-2 ring-inset' : ''"
        :style="filter === c.id ? { '--tw-ring-color': c.color } : undefined"
        :initial="{ opacity: 0, y: 8 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ delay: i * 0.04 }"
        :while-press="{ scale: 0.94 }"
        @click="open(c)"
      >
        <span class="relative grid size-11 place-items-center rounded-full text-white shadow-md" :style="{ background: `linear-gradient(135deg, ${c.color}, ${c.color2})` }">
          <UIcon :name="`i-lucide-${c.icon}`" class="size-5" />
          <span v-if="!c.places.length" class="absolute -bottom-0.5 -right-0.5 grid size-4.5 place-items-center rounded-full bg-(--ui-bg) text-(--ui-text-highlighted) shadow">
            <UIcon name="i-lucide-plus" class="size-3" />
          </span>
          <span v-else-if="c.places.length > 1" class="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-(--ui-bg) px-1 text-[10px] font-bold text-(--ui-text-highlighted) shadow">
            {{ c.places.length }}
          </span>
        </span>
        <span class="w-full truncate text-center text-xs font-semibold">{{ catLabel(c.id, c.label) }}</span>
        <span class="-mt-1 w-full truncate text-center text-[10px] text-(--ui-text-muted)">
          {{ c.places.length === 1 ? (c.places[0]!.person || c.places[0]!.name) : c.places.length ? t('personal.count', { n: c.places.length }) : t('personal.add') }}
        </span>
      </motion.button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { PERSONAL, type Category } from '~/utils/categories'
import type { Place } from '~/utils/db'

withDefaults(defineProps<{ title?: boolean }>(), { title: true })
const emit = defineEmits<{ picked: [] }>()

const { places } = usePlaces()
const { select, mapApi, filter, picking, pendingCategory, snap } = useAppState()
const { t, catLabel } = useLang()
const toast = useToast()

const rows = computed(() => PERSONAL.map(c => ({ ...c, places: places.value.filter(p => p.category === c.id) })))

function open(c: Category & { places: Place[] }) {
  haptic('tap')
  emit('picked')
  if (!c.places.length) {
    // Set a new home / office / …: drop the centre pin, pre-labelled
    pendingCategory.value = c.id
    select(null)
    snap.value = 'peek'
    picking.value = true
    toast.add({ title: t('personal.pickSpot', { label: catLabel(c.id, c.label) }), icon: `i-lucide-${c.icon}`, duration: 2500 })
    return
  }
  if (c.places.length === 1) {
    const p = c.places[0]!
    select(p.id)
    mapApi.value?.flyTo(p.lng, p.lat, 16)
    return
  }
  // Several: show them all and filter the list
  filter.value = filter.value === c.id ? 'all' : c.id
  const lngs = c.places.map(p => p.lng)
  const lats = c.places.map(p => p.lat)
  mapApi.value?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], 15)
}
</script>
