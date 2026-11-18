<template>
  <div class="relative grid grid-cols-2 rounded-2xl bg-(--ui-bg-elevated) p-1" role="radiogroup">
    <button
      v-for="s in options"
      :key="s.value"
      role="radio"
      :aria-checked="model === s.value"
      class="relative z-10 flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors duration-200"
      :class="model === s.value ? 'text-white' : 'text-(--ui-text-muted)'"
      @click="model = s.value"
    >
      <motion.span
        v-if="model === s.value"
        :layout-id="`status-pill-${uid}`"
        class="absolute inset-0 -z-10 rounded-xl shadow-sm"
        :style="{ background: STATUS_COLORS[s.value] }"
        :transition="{ type: 'spring', stiffness: 500, damping: 36 }"
      />
      <UIcon :name="s.icon" class="size-4" />
      {{ s.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { STATUS_COLORS, type PlaceStatus } from '~/utils/db'

const model = defineModel<PlaceStatus>({ required: true })
const uid = useId()
const options = [
  { value: 'been' as const, label: 'Been here', icon: 'i-lucide-check-circle-2' },
  { value: 'planned' as const, label: 'Want to go', icon: 'i-lucide-bookmark' },
]
</script>
