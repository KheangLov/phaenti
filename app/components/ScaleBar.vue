<template>
  <Transition enter-active-class="transition duration-200" leave-active-class="transition duration-500" enter-from-class="opacity-0" leave-to-class="opacity-0">
    <div v-if="visible" class="pointer-events-none select-none" aria-hidden="true">
      <div class="text-[11px] font-semibold text-(--ui-text) [text-shadow:0_0_3px_var(--ui-bg),0_0_3px_var(--ui-bg)]">{{ label }}</div>
      <div class="h-1.5 rounded-b-sm border-x-2 border-b-2 border-(--ui-text)/80 shadow-[0_1px_0_var(--ui-bg)]" :style="{ width: `${width}px` }" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { formatKm } from '~/utils/geo'

// Google-style scale bar: shows while you zoom, fades out shortly after
const { camera, zooming } = useAppState()
const { isKm } = useLang()
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined
watch(zooming, (z) => {
  clearTimeout(hideTimer)
  if (z) visible.value = true
  else hideTimer = setTimeout(() => (visible.value = false), 1600)
})

const MAX = 96
const pick = computed(() => {
  const { zoom, lat } = camera.value
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom) // metres per CSS pixel
  const maxM = mpp * MAX
  const pow = 10 ** Math.floor(Math.log10(maxM))
  const nice = [5, 2, 1].map(k => k * pow).find(v => v <= maxM) ?? pow
  return { m: nice, px: nice / mpp }
})
const width = computed(() => Math.round(pick.value.px))
const label = computed(() => formatKm(pick.value.m / 1000, isKm.value))
</script>
