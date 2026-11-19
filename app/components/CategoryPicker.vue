<template>
  <div class="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <div class="flex w-max gap-1.5 pb-1" role="radiogroup" aria-label="Category">
      <button
        v-for="c in CATEGORIES"
        :key="c.id"
        role="radio"
        :aria-checked="model === c.id"
        class="relative flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200"
        :class="model === c.id ? 'text-white' : 'bg-(--ui-bg-elevated) text-(--ui-text-muted)'"
        @click="pick(c.id)"
      >
        <motion.span
          v-if="model === c.id"
          :layout-id="`cat-pill-${uid}`"
          class="absolute inset-0 rounded-full"
          :style="{ background: `linear-gradient(135deg, ${c.color}, ${c.color2})`, boxShadow: `0 6px 16px -8px ${c.color}` }"
          :transition="{ type: 'spring', stiffness: 520, damping: 36 }"
        />
        <UIcon :name="`i-lucide-${c.icon}`" class="relative size-4" :style="model === c.id ? undefined : { color: c.color }" />
        <span class="relative">{{ catLabel(c.id, c.label) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { CATEGORIES, type CategoryId } from '~/utils/categories'

const model = defineModel<CategoryId>({ required: true })
const uid = useId()
const { catLabel } = useLang()

function pick(id: CategoryId) {
  model.value = id
  haptic('select')
}
</script>
