<template>
  <div class="relative">
    <div
      class="glass shadow-float flex items-center gap-2 rounded-2xl pl-3.5 pr-1.5 h-12 transition-[border-radius] duration-200"
      :class="open ? 'rounded-b-md' : ''"
    >
      <UIcon name="i-lucide-search" class="size-5 shrink-0 text-(--ui-text-muted)" />
      <input
        ref="input"
        v-model="q"
        type="search"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder="Search places or paste coordinates"
        class="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-(--ui-text-dimmed)"
        @focus="focused = true"
        @blur="onBlur"
        @keydown.enter.prevent="pick(0)"
        @keydown.esc="clear"
      >
      <Transition enter-from-class="opacity-0 scale-75" leave-to-class="opacity-0 scale-75" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
        <button v-if="q" class="grid size-9 place-items-center rounded-full text-(--ui-text-muted) active:scale-90 transition" aria-label="Clear" @mousedown.prevent @click="clear">
          <UIcon name="i-lucide-x" class="size-4.5" />
        </button>
      </Transition>
      <div v-if="loading" class="mr-2 size-4 rounded-full border-2 border-(--ui-primary) border-t-transparent animate-spin" />
    </div>

    <AnimatePresence>
      <motion.div
        v-if="open"
        key="results"
        class="glass shadow-float absolute inset-x-0 top-[calc(100%+4px)] max-h-[55vh] overflow-y-auto rounded-b-2xl rounded-t-md py-1.5"
        :initial="{ opacity: 0, y: -8, scale: 0.98 }"
        :animate="{ opacity: 1, y: 0, scale: 1 }"
        :exit="{ opacity: 0, y: -6, scale: 0.98 }"
        :transition="{ duration: 0.18 }"
      >
        <template v-for="(r, i) in items" :key="r.key">
          <div v-if="r.section" class="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">
            {{ r.section }}
          </div>
          <motion.button
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-(--ui-bg-elevated) hover:bg-(--ui-bg-elevated)/60"
            :initial="{ opacity: 0, x: -6 }"
            :animate="{ opacity: 1, x: 0 }"
            :transition="{ delay: Math.min(i, 8) * 0.025, duration: 0.2 }"
            @mousedown.prevent
            @click="pick(i)"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-full" :style="{ background: `${r.color}1f`, color: r.color }">
              <UIcon :name="r.icon" class="size-4.5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-medium">{{ r.title }}</span>
              <span v-if="r.subtitle" class="block truncate text-[13px] text-(--ui-text-muted)">{{ r.subtitle }}</span>
            </span>
          </motion.button>
        </template>
        <div v-if="!items.length && !loading" class="px-4 py-5 text-center text-sm text-(--ui-text-muted)">
          {{ error || 'No places found' }}
        </div>
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { refDebounced } from '@vueuse/core'
import type { GeoResult } from '~/composables/useGeocode'
import { STATUS_COLORS } from '~/utils/db'

const { places } = usePlaces()
const { mapApi, select, openDraft } = useAppState()

const input = ref<HTMLInputElement>()
const q = ref('')
const focused = ref(false)
const loading = ref(false)
const error = ref('')
const remote = shallowRef<GeoResult[]>([])

const query = refDebounced(q, 280)

const local = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return []
  return places.value.filter(p => p.name.toLowerCase().includes(s) || p.address.toLowerCase().includes(s)).slice(0, 4)
})
const coords = computed(() => parseCoordinates(q.value))

interface Item { key: string; section?: string; title: string; subtitle: string; icon: string; color: string; run: () => void }

const items = computed<Item[]>(() => {
  const out: Item[] = []
  if (coords.value) {
    const { lat, lng } = coords.value
    out.push({ key: 'coords', section: 'Coordinates', title: formatCoords(lat, lng), subtitle: 'Drop a pin here', icon: 'i-lucide-crosshair', color: '#0ea5e9', run: () => draftAt(lat, lng, 'Pinned location', formatCoords(lat, lng)) })
  }
  local.value.forEach((p, i) => out.push({
    key: `l${p.id}`, section: i === 0 ? 'My places' : undefined, title: p.name, subtitle: p.address,
    icon: p.status === 'been' ? 'i-lucide-check' : 'i-lucide-bookmark', color: STATUS_COLORS[p.status],
    run: () => { select(p.id); mapApi.value?.flyTo(p.lng, p.lat, 15) },
  }))
  remote.value.forEach((r, i) => out.push({
    key: `r${r.id}${i}`, section: i === 0 ? 'Search results' : undefined, title: r.name, subtitle: r.subtitle,
    icon: 'i-lucide-map-pin', color: '#71717a', run: () => draftAt(r.lat, r.lng, r.name, r.subtitle),
  }))
  return out
})

const open = computed(() => focused.value && q.value.trim().length > 0)

let ctrl: AbortController | null = null
watch(query, async (s) => {
  ctrl?.abort()
  error.value = ''
  const text = s.trim()
  if (text.length < 2 || parseCoordinates(text)) {
    remote.value = []
    loading.value = false
    return
  }
  ctrl = new AbortController()
  loading.value = true
  try {
    remote.value = await searchPlaces(text, mapApi.value?.center(), ctrl.signal)
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      remote.value = []
      error.value = navigator.onLine ? 'Search is unavailable right now' : 'You are offline — showing your saved places only'
    }
  } finally {
    loading.value = false
  }
})

function draftAt(lat: number, lng: number, name: string, address: string) {
  openDraft({ name, address, lat, lng, source: 'search' })
  mapApi.value?.flyTo(lng, lat, 15)
}

function pick(i: number) {
  const it = items.value[i]
  if (!it) return
  it.run()
  clear()
  input.value?.blur()
}
function clear() {
  q.value = ''
  remote.value = []
}
function onBlur() {
  setTimeout(() => (focused.value = false), 120)
}
</script>
