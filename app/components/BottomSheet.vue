<template>
  <!-- Scrim: dims the map as the sheet rises to full; tap it to drop back to half -->
  <motion.div
    v-if="!hidden"
    class="fixed inset-0 z-[19] bg-black"
    :class="snap === 'full' ? 'pointer-events-auto' : 'pointer-events-none'"
    :style="{ opacity: scrim }"
    aria-hidden="true"
    @click="snap = 'half'"
  />
  <div class="fixed inset-x-0 bottom-0 z-20 pointer-events-none" :style="{ height: `${sheetH}px` }">
    <motion.div
      class="sheet pointer-events-auto mx-auto flex h-full max-w-xl flex-col rounded-t-[28px] shadow-sheet"
      :class="settled && snap !== 'full' ? 'glass' : 'sheet-solid'"
      :style="{ y }"
    >
      <div
        ref="handle"
        class="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing transition-shadow"
        :class="scrolled ? 'shadow-[0_6px_12px_-10px_rgb(0_0_0/0.35)]' : ''"
        @pointerdown="onDown"
      >
        <button
          class="mx-auto block py-2.5 px-6"
          :aria-label="t('app.resize')"
          :aria-expanded="snap !== 'peek'"
          @click="cycle"
        >
          <motion.span
            class="block h-1.5 rounded-full bg-(--ui-text-dimmed)/40"
            :animate="{ width: dragActive ? 52 : 40, opacity: dragActive ? 0.9 : 1 }"
            :transition="{ type: 'spring', stiffness: 600, damping: 32 }"
          />
        </button>
        <slot name="header" />
      </div>
      <div
        ref="body"
        class="sheet-body min-h-0 flex-1 overscroll-contain pb-safe"
        :class="snap === 'peek' ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto'"
        @focusin="onFocusIn"
        @scroll.passive="onScroll"
      >
        <slot />
      </div>
    </motion.div>
  </div>
</template>

<script setup lang="ts">
import { motion, useMotionValue, useTransform, animate } from 'motion-v'
import type { SheetSnap } from '~/composables/useAppState'

const props = withDefaults(defineProps<{ hidden?: boolean; peek?: number; dismissible?: boolean; contentKey?: string }>(), { hidden: false, peek: 156, dismissible: false })
const emit = defineEmits<{ dismiss: [] }>()
const { t } = useLang()
const snap = defineModel<SheetSnap>('snap', { default: 'peek' })
const bodyEl = useTemplateRef<HTMLElement>('body')

// A new card (place, route, area…) always starts at its top
const scrolled = ref(false)
watch(() => props.contentKey, () => {
  bodyEl.value?.scrollTo({ top: 0 })
  scrolled.value = false
})
function onScroll() {
  const s = (bodyEl.value?.scrollTop ?? 0) > 4
  if (s !== scrolled.value) scrolled.value = s
}

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
// Map dims only between half and full
const scrim = useTransform(y, (v: number) => {
  const half = offsets.value.half
  return half <= 0 ? 0 : Math.min(0.32, Math.max(0, (1 - v / half) * 0.32))
})

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const spring = { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 } as const

// While the sheet moves it drops the frosted blur: re-blurring the map on every
// frame is the most expensive thing on screen. The blur returns once it settles.
const settled = ref(true)
const dragActive = ref(false)
let anim: { stop: () => void; then?: (f: () => void) => unknown } | null = null
function go() {
  anim?.stop()
  if (reduceMotion) {
    y.set(target())
    settled.value = true
    return
  }
  settled.value = false
  const a = animate(y, target(), spring) as unknown as { stop: () => void; then: (f: () => void) => unknown }
  anim = a
  a.then(() => {
    if (anim === a) settled.value = true
  })
}

watch([snap, () => props.hidden, offsets], go)
watch(snap, () => haptic('snap'))

const onResize = () => (winH.value = window.innerHeight)
onMounted(() => {
  window.addEventListener('resize', onResize, { passive: true })
  const b = bodyEl.value!
  b.addEventListener('touchstart', onTouchStart, { passive: true })
  b.addEventListener('touchmove', onTouchMove, { passive: false })
  b.addEventListener('touchend', onTouchEnd, { passive: true })
  b.addEventListener('touchcancel', onTouchEnd, { passive: true })
  // A drag that ends over a row must not also "tap" it
  b.addEventListener('click', (e) => {
    if (performance.now() - lastDragEnd < 400) {
      e.stopPropagation()
      e.preventDefault()
    }
  }, { capture: true })
})
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

// ---- Shared drag logic (handle with pointer, content with touch) ----
let startVal = 0
let dragged = false
let samples: { t: number; y: number }[] = []
let lastDragEnd = 0

function beginDrag(clientY: number, t: number) {
  anim?.stop()
  startVal = y.get()
  samples = [{ t, y: clientY }]
  dragged = true
  dragActive.value = true
  settled.value = false
}
function moveDrag(dy: number, clientY: number, t: number) {
  let next = startVal + dy
  const max = offsets.value.peek
  if (next < 0) next = next * 0.25 // rubber-band above full
  if (next > max) next = max + (next - max) * 0.35
  y.set(next)
  samples.push({ t, y: clientY })
  if (samples.length > 6) samples.shift()
}
function endDrag() {
  dragActive.value = false
  lastDragEnd = performance.now()
  const a = samples[0]!
  const b = samples[samples.length - 1]!
  // Velocity over the last ~100 ms only, so a pause before lifting the finger counts as "no fling"
  const recent = samples.filter(s => b.t - s.t < 100)
  const r0 = recent[0] ?? a
  const v = (b.y - r0.y) / Math.max(1, b.t - r0.t) // px per ms
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

// Handle / header: pointer events (mouse and touch)
let pStartY = 0
let pDragging = false
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  pStartY = e.clientY
  pDragging = false
  dragged = false
  samples = [{ t: e.timeStamp, y: e.clientY }]
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp, { once: true })
  window.addEventListener('pointercancel', onUp, { once: true })
}
function onMove(e: PointerEvent) {
  const dy = e.clientY - pStartY
  if (!pDragging && Math.abs(dy) > 6) {
    pDragging = true
    beginDrag(pStartY, e.timeStamp)
  }
  if (pDragging) moveDrag(dy, e.clientY, e.timeStamp)
}
function onUp() {
  window.removeEventListener('pointermove', onMove)
  if (!pDragging) return
  pDragging = false
  endDrag()
}

// Content: like native sheets, swiping the content moves the sheet until it's full;
// at full, pulling down from the very top drags it back down. Otherwise it scrolls.
let tStartX = 0
let tStartY = 0
let tMode: 'idle' | 'undecided' | 'sheet' | 'scroll' = 'idle'
function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1 || props.hidden) { tMode = 'scroll'; return }
  const tch = e.touches[0]!
  tStartX = tch.clientX
  tStartY = tch.clientY
  tMode = 'undecided'
}
function onTouchMove(e: TouchEvent) {
  if (tMode === 'scroll' || tMode === 'idle') return
  const tch = e.touches[0]!
  const dx = tch.clientX - tStartX
  const dy = tch.clientY - tStartY
  if (tMode === 'undecided') {
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    const vertical = Math.abs(dy) > Math.abs(dx)
    const atTop = (bodyEl.value?.scrollTop ?? 0) <= 0
    const wantsSheet = vertical && (snap.value !== 'full' ? !(snap.value === 'half' && dy > 0 && !atTop) : dy > 0 && atTop)
    // Inputs and sliders keep their own gestures
    const t = e.target as HTMLElement
    if (!wantsSheet || t.closest('input, textarea, [data-no-sheet-drag]')) {
      tMode = 'scroll'
      return
    }
    tMode = 'sheet'
    beginDrag(tStartY, e.timeStamp)
  }
  e.preventDefault()
  moveDrag(dy, tch.clientY, e.timeStamp)
}
function onTouchEnd() {
  if (tMode === 'sheet') endDrag()
  tMode = 'idle'
}
</script>

<style scoped>
.sheet {
  will-change: transform;
  contain: layout style;
  transition: background-color 0.25s ease;
}
.sheet-solid {
  background: color-mix(in oklab, var(--ui-bg) 97%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-border) 75%, transparent);
}
</style>
