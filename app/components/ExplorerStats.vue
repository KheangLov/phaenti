<template>
  <motion.div
    class="relative overflow-hidden rounded-3xl p-4 text-white"
    style="background: radial-gradient(120% 140% at 0% 0%, #10b981 0%, #0f766e 45%, #4c1d95 100%)"
    :initial="{ opacity: 0, y: 10 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.35 }"
  >
    <!-- decorative contour lines -->
    <svg class="pointer-events-none absolute -right-6 -top-6 size-40 opacity-20" viewBox="0 0 100 100" fill="none" stroke="white" stroke-width="0.8">
      <circle cx="70" cy="30" r="12" /><circle cx="70" cy="30" r="20" /><circle cx="70" cy="30" r="28" /><circle cx="70" cy="30" r="36" /><circle cx="70" cy="30" r="44" />
    </svg>

    <div class="relative flex items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Cambodia explored</p>
        <p class="mt-1 text-2xl font-bold tracking-tight">
          <AnimatedNumber :value="pct" />%
          <span class="ml-1 text-sm font-medium text-white/75">of provinces</span>
        </p>
      </div>
      <button
        class="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur active:scale-95 transition"
        @click="showCambodia"
      >
        <UIcon name="i-lucide-map" class="size-3.5" /> View
      </button>
    </div>

    <div class="relative mt-4 grid grid-cols-3 gap-2">
      <div v-for="s in rows" :key="s.label" class="rounded-2xl bg-white/12 p-2.5 backdrop-blur-sm">
        <div class="flex items-baseline gap-1">
          <span class="text-lg font-bold tabular-nums"><AnimatedNumber :value="s.value" /></span>
          <span class="text-[11px] text-white/70">/ {{ s.total }}</span>
        </div>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
          <motion.div
            class="h-full rounded-full bg-white"
            :initial="{ width: '0%' }"
            :animate="{ width: `${Math.max(s.value ? 4 : 0, (s.value / s.total) * 100)}%` }"
            :transition="{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }"
          />
        </div>
        <p class="mt-1.5 text-[11px] font-medium text-white/80">{{ s.label }}</p>
      </div>
    </div>
  </motion.div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { explored, ADMIN_TOTALS } from '~/composables/useAdmin'

const { mapApi, showExplored } = useAppState()

const rows = computed(() => [
  { label: 'Provinces', value: explored.value.provinces, total: ADMIN_TOTALS.provinces },
  { label: 'Districts', value: explored.value.districts, total: ADMIN_TOTALS.districts },
  { label: 'Communes', value: explored.value.communes, total: ADMIN_TOTALS.communes },
])
const pct = computed(() => Math.round((explored.value.provinces / ADMIN_TOTALS.provinces) * 100))

function showCambodia() {
  showExplored.value = true
  mapApi.value?.fitBounds([102.3, 10.4, 107.65, 14.7], 7)
}
</script>
