<template>
  <div class="fixed inset-x-0 bottom-0 z-20 pointer-events-none" :style="{ height: `${sheetH}px` }">
    <motion.div
      class="pointer-events-auto mx-auto flex h-full max-w-xl flex-col rounded-t-[28px] glass shadow-sheet will-change-transform"
      :style="{ y }"
    >
      <div
        ref="handle"
        class="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing"
        @pointerdown="onDown"
      >
        <button
          class="mx-auto block py-2.5 px-6"
          :aria-label="t('app.resize')"
          @click="cycle"
        >
          <span class="block h-1.5 w-10 rounded-full bg-(--ui-text-dimmed)/40" />
        </button>
        <slot name="header" />
      </div>
      <div
        ref="body"
        class="min-h-0 flex-1 overscroll-contain pb-safe"
        @focusin="onFocusIn"
        :class="snap === 'peek' ? 'overflow-hidden' : 'overflow-y-auto'"
      >
        <slot />
      </div>
    </motion.div>
  </div>
</template>

<script setup lang="ts">
import { motion, useMotionValue, animate } from 'motion-v'
import type { SheetSnap } from '~/composables/useAppState'

const props = withDefaults(defineProps<{ hidden?: boolean; peek?: number; dismissible?: boolean }>(), { hidden: false, peek: 156, dismissible: false })
const emit = defineEmits<{ dismiss: [] }>()
const { t } = useLang()
const snap = defineModel<SheetSnap>('snap', { default: 'peek' })

const winH = ref(typeof window !== 'undefined' ? window.innerHeight : 800)
const sheetH = computed(() => Math.round(winH.value * 0.92))
const offsets = computed<Record<SheetSnap, number>>(() => ({
  full: 0,
  half: Math.max(0, sheetH.value - Math.round(winH.value * 0.52)),
  peek: sheetH.value - props.peek,
}))
const hiddenOffset = computed(() => sheetH.value + 24)
const target = () => (props.hidden ? hiddenOffset.value : offsets.value[snap.value])

const y = useMotionValue(target())
const spring = { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 } as const
const go = () => animate(y, target(), spring)

watch([snap, () => props.hidden, offsets], go)
watch(snap, () => haptic('snap'))

const onResize = () => (winH.value = window.innerHeight)
onMounted(() => window.addEventListener('resize', onResize, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const order: SheetSnap[] = ['peek', 'half', 'full']

// Typing in the sheet (notes, names): give it the full height so the keyboard doesn't cover it
function onFocusIn(e: FocusEvent) {
  const el = e.target as HTMLElement
  if (el.matches('input:not([type=date]), textarea')) snap.value = 'full'
}
function cycle() {
  if (dragged) return
  snap.value = order[(order.indexOf(snap.value) + 1) % order.length]!
}

// ---- Drag with velocity-aware snapping ----
const handle = ref<HTMLElement>()
let startY = 0
let startVal = 0
let dragging = false
let dragged = false
let samples: { t: number; y: number }[] = []

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  startY = e.clientY
  startVal = y.get()
  dragging = false
  dragged = false
  samples = [{ t: e.timeStamp, y: e.clientY }]
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp, { once: true })
  window.addEventListener('pointercancel', onUp, { once: true })
}

function onMove(e: PointerEvent) {
  const dy = e.clientY - startY
  if (!dragging && Math.abs(dy) > 6) {
    dragging = true
    dragged = true
    y.stop()
  }
  if (!dragging) return
  let next = startVal + dy
  const max = offsets.value.peek
  if (next < 0) next = next * 0.25 // rubber-band above full
  if (next > max) next = max + (next - max) * 0.35
  y.set(next)
  samples.push({ t: e.timeStamp, y: e.clientY })
  if (samples.length > 6) samples.shift()
}

function onUp() {
  window.removeEventListener('pointermove', onMove)
  if (!dragging) return
  dragging = false
  const a = samples[0]!
  const b = samples[samples.length - 1]!
  const v = (b.y - a.y) / Math.max(1, b.t - a.t) // px per ms
  const projected = y.get() + v * 220
  // Swipe a place card down past the peek height to close it, like native maps apps
  if (props.dismissible && projected > offsets.value.peek + 70) {
    emit('dismiss')
    setTimeout(() => (dragged = false), 0)
    return
  }
  let best: SheetSnap = 'peek'
  let bestD = Infinity
  for (const s of order) {
    const d = Math.abs(offsets.value[s] - projected)
    if (d < bestD) { bestD = d; best = s }
  }
  if (best === snap.value) go()
  else snap.value = best
  setTimeout(() => (dragged = false), 0)
}
</script>
