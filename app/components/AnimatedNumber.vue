<template>
  <span class="tabular-nums">{{ display }}</span>
</template>

<script setup lang="ts">
const props = defineProps<{ value: number }>()
const display = ref(props.value)
let raf = 0

watch(() => props.value, (to, from) => {
  cancelAnimationFrame(raf)
  const start = performance.now()
  const dur = 500
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur)
    display.value = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
})
</script>
