<template>
  <AnimatePresence>
    <motion.div
      v-if="measuring"
      key="measure"
      class="pb-safe absolute inset-x-0 bottom-0 z-30 px-3"
      :initial="{ y: 200 }"
      :animate="{ y: 0 }"
      :exit="{ y: 200 }"
      :transition="{ type: 'spring', stiffness: 420, damping: 38 }"
    >
      <div class="glass shadow-sheet mx-auto max-w-xl rounded-[28px] p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <UIcon name="i-lucide-ruler" class="size-4" /> {{ t('measure.title') }}
            </p>
            <template v-if="measurePts.length >= 2">
              <p v-if="measureClosed" class="mt-1 text-3xl font-bold tracking-tight">{{ formatArea(area, isKm) }}</p>
              <p v-else class="mt-1 text-3xl font-bold tracking-tight">{{ formatKm(distance, isKm) }}</p>
              <p class="text-sm text-(--ui-text-muted)">
                <template v-if="measureClosed">{{ t('measure.perimeter') }} {{ formatKm(perimeter, isKm) }} · </template>
                {{ t('measure.points', { n: measurePts.length }) }}
              </p>
            </template>
            <p v-else class="mt-1 text-[15px] text-(--ui-text-muted)">{{ t('measure.hint') }}</p>
            <p v-if="measurePts.length >= 3 && !measureClosed" class="mt-1 text-xs text-(--ui-text-dimmed)">{{ t('measure.hintClose') }}</p>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2">
          <UButton color="neutral" variant="soft" size="lg" class="justify-center rounded-2xl" icon="i-lucide-undo-2" :disabled="!measurePts.length" @click="undo">
            {{ t('measure.undo') }}
          </UButton>
          <UButton color="neutral" variant="soft" size="lg" class="justify-center rounded-2xl" icon="i-lucide-trash-2" :disabled="!measurePts.length" @click="clear">
            {{ t('measure.clear') }}
          </UButton>
          <UButton size="lg" class="justify-center rounded-2xl" color="warning" icon="i-lucide-check" @click="done">
            {{ t('measure.done') }}
          </UButton>
        </div>
      </div>
    </motion.div>
  </AnimatePresence>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { pathKm, areaKm2, formatKm, formatArea } from '~/utils/geo'

const { measuring, measurePts, measureClosed } = useAppState()
const { t, isKm } = useLang()

const distance = computed(() => pathKm(measurePts.value))
const perimeter = computed(() => pathKm([...measurePts.value, measurePts.value[0]!].filter(Boolean)))
const area = computed(() => areaKm2(measurePts.value))

function undo() {
  if (measureClosed.value) measureClosed.value = false
  else measurePts.value = measurePts.value.slice(0, -1)
  haptic('tap')
}
function clear() {
  measurePts.value = []
  measureClosed.value = false
  haptic('tap')
}
function done() {
  measuring.value = false
  clear()
}
</script>
