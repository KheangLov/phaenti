<template>
  <div class="grid grid-cols-4 gap-2" role="radiogroup" :aria-label="t('personal.type')">
    <motion.button
      v-for="c in PERSONAL"
      :key="c.id"
      role="radio"
      :aria-checked="model === c.id"
      class="relative flex flex-col items-center gap-1.5 rounded-2xl py-2.5 text-xs font-semibold transition-colors"
      :class="model === c.id ? 'text-white' : 'bg-(--ui-bg-elevated) text-(--ui-text-muted)'"
      :while-press="{ scale: 0.94 }"
      @click="pick(c.id)"
    >
      <motion.span
        v-if="model === c.id"
        :layout-id="`personal-pill-${uid}`"
        class="absolute inset-0 rounded-2xl"
        :style="{ background: `linear-gradient(135deg, ${c.color}, ${c.color2})`, boxShadow: `0 8px 18px -10px ${c.color}` }"
        :transition="{ type: 'spring', stiffness: 520, damping: 36 }"
      />
      <UIcon :name="`i-lucide-${c.icon}`" class="relative size-5" :style="model === c.id ? undefined : { color: c.color }" />
      <span class="relative">{{ catLabel(c.id, c.label) }}</span>
    </motion.button>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { PERSONAL, type CategoryId, type PersonalId } from '~/utils/categories'

const model = defineModel<CategoryId>({ required: true })
const uid = useId()
const { t, catLabel } = useLang()

function pick(id: PersonalId) {
  model.value = id
  haptic('select')
}
</script>
