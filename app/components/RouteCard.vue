<template>
  <div class="px-5 pt-1 pb-6">
    <!-- From / To -->
    <div class="flex items-start gap-3">
      <div class="flex flex-col items-center pt-3.5">
        <span class="size-3 rounded-full border-[3px] border-emerald-500" />
        <span class="my-1 h-7 w-0.5 rounded-full bg-(--ui-border)" />
        <UIcon name="i-lucide-map-pin" class="size-4" :style="{ color: modeColor }" />
      </div>
      <div class="min-w-0 flex-1 space-y-2">
        <div class="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none]">
          <div class="flex w-max gap-1.5">
            <button
              v-for="o in fromOptions"
              :key="o.key"
              class="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition"
              :class="fromKey === o.key ? 'bg-(--ui-text-highlighted) text-(--ui-bg)' : 'bg-(--ui-bg-elevated) text-(--ui-text-muted)'"
              @click="chooseFrom(o)"
            >
              <UIcon :name="o.icon" class="size-4" :style="fromKey === o.key ? undefined : { color: o.color }" />
              <span class="max-w-36 truncate">{{ o.label }}</span>
            </button>
          </div>
        </div>
        <div class="flex h-10 items-center rounded-xl bg-(--ui-bg-elevated) px-3">
          <span class="truncate text-[15px] font-semibold">{{ route.to.name }}</span>
        </div>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="soft" class="rounded-full" :aria-label="t('place.close')" @click="closeAll" />
    </div>

    <!-- Modes -->
    <div class="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-(--ui-bg-elevated) p-1" role="radiogroup">
      <button
        v-for="m in MODES"
        :key="m.id"
        role="radio"
        :aria-checked="route.mode === m.id"
        class="relative flex h-11 flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors"
        :class="route.mode === m.id ? 'text-white' : 'text-(--ui-text-muted)'"
        @click="setMode(m.id)"
      >
        <motion.span
          v-if="route.mode === m.id"
          layout-id="mode-pill"
          class="absolute inset-0 rounded-xl"
          :style="{ background: m.color }"
          :transition="{ type: 'spring', stiffness: 520, damping: 38 }"
        />
        <UIcon :name="m.icon" class="relative size-5" />
        <span class="relative leading-tight">{{ t(`route.${m.id}`) }}</span>
      </button>
    </div>

    <!-- Result -->
    <div class="mt-4 min-h-28">
      <div v-if="loading" class="space-y-3">
        <div class="flex items-center gap-2 text-sm text-(--ui-text-muted)">
          <span class="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
          {{ t('route.finding') }}
        </div>
        <div class="h-8 w-40 animate-pulse rounded-lg bg-(--ui-bg-elevated)" />
        <div class="h-4 w-56 animate-pulse rounded bg-(--ui-bg-elevated)" />
      </div>

      <div v-else-if="error" class="rounded-2xl bg-amber-500/10 p-4">
        <p class="text-sm">{{ error }}</p>
        <UButton v-if="error !== t('route.errLocation')" size="sm" variant="soft" color="warning" class="mt-3" icon="i-lucide-rotate-cw" @click="run">
          {{ t('route.retry') }}
        </UButton>
      </div>

      <motion.div v-else-if="result" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }">
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="text-3xl font-bold tracking-tight" :style="{ color: modeColor }">{{ formatDuration(result.seconds, isKm) }}</p>
            <p class="mt-0.5 text-sm text-(--ui-text-muted)">
              {{ formatKm(result.km, isKm) }} · {{ t('route.arrive', { time: arrival }) }}
            </p>
          </div>
          <UButton
            :to="googleUrl"
            target="_blank"
            size="lg"
            class="rounded-2xl"
            icon="i-lucide-navigation-2"
            :style="{ background: modeColor }"
          >
            {{ t('route.navigate') }}
          </UButton>
        </div>

        <!-- Steps -->
        <button class="mt-4 flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-semibold" @click="showSteps = !showSteps">
          {{ showSteps ? t('route.hideSteps') : t('route.showSteps', { n: result.steps.length }) }}
          <UIcon name="i-lucide-chevron-down" class="size-4 transition-transform" :class="showSteps ? 'rotate-180' : ''" />
        </button>
        <ol v-if="showSteps" class="mt-1 divide-y divide-(--ui-border)">
          <li v-for="(s, i) in result.steps" :key="i">
            <button class="flex w-full items-center gap-3 py-2.5 text-left active:bg-(--ui-bg-elevated)" @click="mapApi?.flyTo(s.at[0], s.at[1], 17)">
              <span class="grid size-9 shrink-0 place-items-center rounded-full bg-(--ui-bg-elevated)">
                <UIcon :name="stepIcon(s.type)" class="size-4.5" :style="{ color: modeColor }" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium">{{ stepText(s) }}</span>
                <span v-if="s.km" class="block text-xs text-(--ui-text-muted)">{{ formatKm(s.km, isKm) }}</span>
              </span>
            </button>
          </li>
        </ol>
      </motion.div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { RouteError, findRoute, googleDirectionsUrl, type RouteResult, type RouteStep, type TravelMode } from '~/composables/useRouting'
import type { RouteEnd, RouteRequest } from '~/composables/useAppState'
import { PERSONAL } from '~/utils/categories'
import type { LngLat } from '~/utils/geo'

const props = defineProps<{ route: RouteRequest }>()
const { route: routeRef, mapApi, closeAll } = useAppState()
const { places } = usePlaces()
const { t, isKm, catLabel, locale } = useLang()

const MODES: { id: TravelMode; icon: string; color: string }[] = [
  { id: 'car', icon: 'i-lucide-car-front', color: '#2563eb' },
  { id: 'moto', icon: 'i-lucide-motorbike', color: '#7c3aed' },
  { id: 'bike', icon: 'i-lucide-bike', color: '#059669' },
  { id: 'walk', icon: 'i-lucide-footprints', color: '#d97706' },
]
const modeColor = computed(() => MODES.find(m => m.id === props.route.mode)!.color)

// ---- Where to start from: your location, your own places, or the map centre ----
interface FromOption { key: string; label: string; icon: string; color: string; end?: RouteEnd }
const fromOptions = computed<FromOption[]>(() => {
  const out: FromOption[] = [{ key: 'me', label: t('route.myLocation'), icon: 'i-lucide-locate-fixed', color: '#0ea5e9' }]
  for (const c of PERSONAL) {
    for (const p of places.value.filter(x => x.category === c.id).slice(0, 3)) {
      if (p.lat === props.route.to.lat && p.lng === props.route.to.lng) continue
      out.push({ key: p.id, label: p.person || p.name || catLabel(c.id, c.label), icon: `i-lucide-${c.icon}`, color: c.color, end: { lat: p.lat, lng: p.lng, name: p.name, kind: 'place' } })
    }
  }
  out.push({ key: 'centre', label: t('route.mapCentre'), icon: 'i-lucide-crosshair', color: '#71717a' })
  return out
})
const fromKey = ref(props.route.from?.kind === 'place' ? fromOptions.value.find(o => o.end?.lat === props.route.from?.lat)?.key ?? 'me' : props.route.from?.kind ?? 'me')

async function chooseFrom(o: FromOption) {
  fromKey.value = o.key
  haptic('select')
  if (o.key === 'me') {
    routeRef.value = { ...props.route, from: null }
  } else if (o.key === 'centre') {
    const c = mapApi.value?.center()
    if (c) routeRef.value = { ...props.route, from: { lat: c.lat, lng: c.lng, name: t('route.mapCentre'), kind: 'centre' } }
  } else if (o.end) {
    routeRef.value = { ...props.route, from: o.end }
  }
}

function setMode(m: TravelMode) {
  haptic('select')
  try { localStorage.setItem('phaenti:mode', m) } catch { /* ignore */ }
  routeRef.value = { ...props.route, mode: m }
}

// ---- Fetch ----
const loading = ref(false)
const error = ref('')
const result = shallowRef<RouteResult | null>(null)
const showSteps = ref(false)
const startPoint = ref<LngLat | null>(null)
let ctrl: AbortController | null = null

async function origin(): Promise<LngLat | null> {
  const f = props.route.from
  if (f) return [f.lng, f.lat]
  const pos = await new Promise<GeolocationPosition | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
  })
  return pos ? [pos.coords.longitude, pos.coords.latitude] : null
}

async function run() {
  ctrl?.abort()
  ctrl = new AbortController()
  const signal = ctrl.signal
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const from = await origin()
    if (signal.aborted) return
    if (!from) {
      error.value = t('route.errLocation')
      return
    }
    startPoint.value = from
    const r = await findRoute(from, [props.route.to.lng, props.route.to.lat], props.route.mode, signal)
    if (signal.aborted) return
    result.value = r
    mapApi.value?.showRoute(r.coords, modeColor.value)
    haptic('success')
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    const code = e instanceof RouteError ? e.code : 'noroute'
    error.value = t({ offline: 'route.errOffline', noroute: 'route.errNoRoute', busy: 'route.errBusy', hidden: 'route.errHidden' }[code])
    mapApi.value?.clearRoute()
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

watch(() => [props.route.mode, props.route.from?.lat, props.route.from?.lng, props.route.to.lat, props.route.to.lng], run, { immediate: true })
onBeforeUnmount(() => {
  ctrl?.abort()
  mapApi.value?.clearRoute()
})

const arrival = computed(() => {
  if (!result.value) return ''
  return new Date(Date.now() + result.value.seconds * 1000).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
})
const googleUrl = computed(() => googleDirectionsUrl(props.route.from ? startPoint.value : null, [props.route.to.lng, props.route.to.lat], props.route.mode))

// ---- Steps: icons and text in either language ----
function stepKey(type: number) {
  if (type >= 1 && type <= 3) return 'start'
  if (type >= 4 && type <= 6) return 'arrived'
  if (type === 9) return 'slightRight'
  if (type === 10) return 'right'
  if (type === 11) return 'sharpRight'
  if (type === 12 || type === 13) return 'uturn'
  if (type === 14) return 'sharpLeft'
  if (type === 15) return 'left'
  if (type === 16) return 'slightLeft'
  if (type === 18 || type === 20 || type === 23) return 'keepRight'
  if (type === 19 || type === 21 || type === 24) return 'keepLeft'
  if (type === 25 || type === 37 || type === 38) return 'merge'
  if (type === 26) return 'roundabout'
  if (type === 27) return 'exitRoundabout'
  if (type === 28) return 'ferry'
  if (type === 29) return 'ferryOff'
  return 'continue'
}
function stepIcon(type: number) {
  return {
    start: 'i-lucide-circle-dot', arrived: 'i-lucide-flag', continue: 'i-lucide-arrow-up',
    slightRight: 'i-lucide-arrow-up-right', right: 'i-lucide-corner-up-right', sharpRight: 'i-lucide-corner-up-right',
    uturn: 'i-lucide-undo-2', sharpLeft: 'i-lucide-corner-up-left', left: 'i-lucide-corner-up-left', slightLeft: 'i-lucide-arrow-up-left',
    keepRight: 'i-lucide-split', keepLeft: 'i-lucide-split', merge: 'i-lucide-merge', roundabout: 'i-lucide-rotate-cw',
    exitRoundabout: 'i-lucide-rotate-cw', ferry: 'i-lucide-ship', ferryOff: 'i-lucide-ship',
  }[stepKey(type)]!
}
function stepText(s: RouteStep) {
  // Valhalla writes good English sentences; Khmer (and OSRM) are built from the manoeuvre
  if (!isKm.value && s.text) return s.text
  const what = t(`route.${stepKey(s.type)}`)
  return s.street && stepKey(s.type) !== 'arrived' ? t('route.onto', { what, street: s.street }) : what
}
</script>
