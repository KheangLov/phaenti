<template>
  <UApp :toaster="{ position: 'top-center', duration: 2500 }">
    <main class="fixed inset-0 overflow-hidden">
      <MapView ref="mapView" @moving="moving = $event" />

      <!-- Top: search -->
      <SearchOverlay ref="search" :hidden="picking" />

      <!-- Offline indicator -->
      <AnimatePresence>
        <motion.button
          v-if="!online && !picking"
          key="offline"
          class="absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
          :style="{ top: 'calc(max(env(safe-area-inset-top), 12px) + 58px)' }"
          :initial="{ y: -12, opacity: 0, scale: 0.9 }"
          :animate="{ y: 0, opacity: 1, scale: 1 }"
          :exit="{ y: -12, opacity: 0, scale: 0.9 }"
          @click="offlineOpen = true"
        >
          <UIcon name="i-lucide-cloud-off" class="size-4" /> Offline · your data is here
        </motion.button>
      </AnimatePresence>

      <!-- Right: map controls -->
      <motion.div
        class="absolute right-3 z-10 flex flex-col gap-2"
        :style="{ top: 'calc(max(env(safe-area-inset-top), 12px) + 64px)' }"
        :animate="{ x: picking ? 80 : 0 }"
        :transition="spring"
      >
        <UDropdownMenu :items="menu" :content="{ align: 'end', side: 'left', sideOffset: 8 }">
          <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" aria-label="Menu">
            <UIcon name="i-lucide-layers" class="size-5" />
          </button>
        </UDropdownMenu>
        <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" aria-label="Show all places" @click="mapApi?.fitAll()">
          <UIcon name="i-lucide-scan" class="size-5" />
        </button>
        <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" aria-label="My location" @click="locate">
          <UIcon :name="locating ? 'i-lucide-loader-circle' : 'i-lucide-locate-fixed'" class="size-5 text-sky-500" :class="locating ? 'animate-spin' : ''" />
        </button>
      </motion.div>

      <!-- Add button -->
      <motion.button
        class="absolute right-4 z-10 grid size-15 place-items-center rounded-[22px] bg-linear-to-br from-emerald-500 to-violet-500 text-white shadow-xl"
        :style="{ bottom: `${PEEK + 16}px` }"
        aria-label="Add a place"
        :initial="{ scale: 0 }"
        :animate="{ scale: showFab ? 1 : 0, rotate: showFab ? 0 : -45 }"
        :while-press="{ scale: 0.9 }"
        :transition="{ type: 'spring', stiffness: 500, damping: 26 }"
        @click="startPicking"
      >
        <UIcon name="i-lucide-plus" class="size-7" />
      </motion.button>

      <!-- Pick mode: centre pin + confirm bar -->
      <AnimatePresence>
        <motion.div
          v-if="picking"
          key="pin"
          class="pointer-events-none absolute left-1/2 top-1/2 z-10 size-0"
          :initial="{ opacity: 0, scale: 0.4 }"
          :animate="{ opacity: 1, scale: 1 }"
          :exit="{ opacity: 0, scale: 0.4 }"
          :transition="{ type: 'spring', stiffness: 520, damping: 26 }"
        >
          <motion.div
            class="absolute left-0 top-0 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35 blur-[2px]"
            :animate="{ width: moving ? 10 : 18, opacity: moving ? 0.35 : 0.7 }"
          />
          <div class="absolute bottom-0 left-0 -translate-x-1/2 translate-y-[2px]">
            <motion.div :animate="{ y: moving ? -14 : 0 }" :transition="{ type: 'spring', stiffness: 600, damping: 22 }">
              <svg width="44" height="56" viewBox="0 0 44 56" class="block drop-shadow-lg">
                <defs>
                  <linearGradient id="pinG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#10b981" />
                    <stop offset="1" stop-color="#8b5cf6" />
                  </linearGradient>
                </defs>
                <path d="M22 2C11 2 3 10.4 3 21c0 13.6 15.4 29.3 18 32a1.4 1.4 0 0 0 2 0c2.6-2.7 18-18.4 18-32C41 10.4 33 2 22 2Z" fill="url(#pinG)" stroke="white" stroke-width="3" />
                <circle cx="22" cy="21" r="6.5" fill="white" />
              </svg>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          v-if="picking"
          key="bar"
          class="pb-safe absolute inset-x-0 bottom-0 z-30 px-3"
          :initial="{ y: 160 }"
          :animate="{ y: 0 }"
          :exit="{ y: 160 }"
          :transition="spring"
        >
          <div class="glass shadow-sheet mx-auto max-w-xl rounded-[28px] p-4">
            <p class="mb-3 text-center text-sm text-(--ui-text-muted)">Move the map to place the pin</p>
            <div class="grid grid-cols-[auto_1fr] gap-2">
              <UButton color="neutral" variant="soft" size="xl" class="rounded-2xl px-5" @click="picking = false">Cancel</UButton>
              <UButton size="xl" block class="rounded-2xl" icon="i-lucide-map-pin" @click="confirmPick">Use this spot</UButton>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <!-- Bottom sheet -->
      <BottomSheet v-model:snap="snap" :hidden="picking" :peek="PEEK">
        <template #header>
          <div v-if="!draft && !selected && !area" class="px-5 pb-3">
            <div class="flex items-end justify-between">
              <div>
                <h2 class="text-xl font-semibold tracking-tight">Your map</h2>
                <p class="text-sm text-(--ui-text-muted)">
                  <AnimatedNumber :value="counts.been" /> been ·
                  <AnimatedNumber :value="counts.planned" /> want to go
                </p>
              </div>
              <button v-if="!standalone" class="flex items-center gap-1 rounded-full bg-(--ui-primary)/12 px-3 py-1.5 text-xs font-semibold text-(--ui-primary) active:scale-95 transition" @click="installOpen = true">
                <UIcon name="i-lucide-download" class="size-3.5" /> Install app
              </button>
              <button v-else class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold active:scale-95 transition" :class="online ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600'" @click="offlineOpen = true">
                <UIcon :name="online ? 'i-lucide-cloud-check' : 'i-lucide-cloud-off'" class="size-3.5" /> {{ online ? 'Offline ready' : 'Offline' }}
              </button>
            </div>
            <div class="mt-3 flex gap-1.5">
              <button
                v-for="f in filters"
                :key="f.value"
                class="relative h-9 rounded-full px-3.5 text-sm font-medium transition-colors"
                :class="filter === f.value ? 'text-(--ui-bg)' : 'text-(--ui-text-muted) bg-(--ui-bg-elevated)'"
                @click="filter = f.value"
              >
                <motion.span
                  v-if="filter === f.value"
                  layout-id="filter-pill"
                  class="absolute inset-0 rounded-full bg-(--ui-text-highlighted)"
                  :transition="{ type: 'spring', stiffness: 500, damping: 38 }"
                />
                <span class="relative">{{ f.label }}</span>
              </button>
            </div>
          </div>
        </template>

        <AnimatePresence mode="wait" :initial="false">
          <motion.div
            :key="contentKey"
            :initial="{ opacity: 0, y: 16 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: -10 }"
            :transition="{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }"
          >
            <DraftCard v-if="draft" :draft="draft" />
            <PlaceDetail v-else-if="selected" :place="selected" />
            <AreaCard v-else-if="area" :area="area" />
            <PlaceList v-else @credits="creditsOpen = true" />
          </motion.div>
        </AnimatePresence>
      </BottomSheet>

      <InstallSheet v-model:open="installOpen" />
      <OfflineSheet v-model:open="offlineOpen" />

      <UModal v-model:open="creditsOpen" title="Map credits" description="Phaenti is built on open data and open-source software.">
        <template #body>
          <ul class="space-y-3 text-sm">
            <li><b>Map data</b> © <a class="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL)</li>
            <li><b>Map tiles</b> <a class="underline" href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, <a class="underline" href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a></li>
            <li><b>Cambodia boundaries</b> Open Development Cambodia (2014), via <a class="underline" href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a>, CC BY 4.0</li>
            <li><b>Khmer names &amp; villages</b> <a class="underline" href="https://github.com/dwilkie/pumi" target="_blank" rel="noopener">Pumi</a> (MIT)</li>
            <li><b>Place search</b> <a class="underline" href="https://photon.komoot.io" target="_blank" rel="noopener">Photon by komoot</a></li>
            <li><b>Map engine</b> <a class="underline" href="https://maplibre.org" target="_blank" rel="noopener">MapLibre GL JS</a></li>
          </ul>
        </template>
      </UModal>

      <input ref="fileInput" type="file" accept=".json,.geojson,application/json,application/geo+json" class="hidden" @change="onImport">
    </main>
  </UApp>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Filter } from '~/composables/useAppState'
import { isStandalone } from '~/composables/useOffline'

const PEEK = 156
const spring = { type: 'spring', stiffness: 420, damping: 38 } as const

const { places, toExport, importFile } = usePlaces()
const { selectedId, draft, area, picking, searching, filter, snap, mapApi, closeAll, showBoundaries, showExplored } = useAppState()
const creditsOpen = ref(false)
const colorMode = useColorMode()
const toast = useToast()
const { $pwa } = useNuxtApp()

const mapView = ref<{ startDraft: (lng: number, lat: number, s: 'map' | 'location') => void }>()
const moving = ref(false)
const locating = ref(false)
const fileInput = ref<HTMLInputElement>()

const selected = computed(() => places.value.find(p => p.id === selectedId.value) ?? null)
const contentKey = computed(() => (draft.value ? `d${draft.value.lat},${draft.value.lng}` : selected.value ? `p${selected.value.id}` : area.value ? `a${area.value.code}${area.value.village?.code ?? ''}` : 'list'))
const showFab = computed(() => !picking.value && !draft.value && !selected.value && !area.value && !searching.value && snap.value === 'peek')

const counts = computed(() => {
  let been = 0
  for (const p of places.value) if (p.status === 'been') been++
  return { been, planned: places.value.length - been }
})

const filters = computed<{ value: Filter; label: string }[]>(() => [
  { value: 'all', label: `All ${places.value.length || ''}`.trim() },
  { value: 'been', label: 'Been' },
  { value: 'planned', label: 'Want to go' },
])

// If a selected place gets deleted elsewhere, fall back to the list
watch(selected, (s) => {
  if (selectedId.value && !s) selectedId.value = null
})

function startPicking() {
  snap.value = 'peek'
  picking.value = true
}
function confirmPick() {
  const c = mapApi.value?.center()
  if (!c) return
  picking.value = false
  mapView.value?.startDraft(c.lng, c.lat, 'map')
}

async function locate() {
  locating.value = true
  const pos = await mapApi.value?.locate()
  locating.value = false
  if (!pos) toast.add({ title: 'Location unavailable', description: 'Allow location access in your browser settings.', icon: 'i-lucide-locate-off', color: 'warning' })
}

// ---- Install ----
const { online } = useOffline()
const installOpen = ref(false)
const offlineOpen = ref(false)
const search = ref<{ openSearch: () => void }>()
const standalone = ref(isStandalone())

// New version available: ask, never reload under the user's feet
watch(() => $pwa?.needRefresh, (v) => {
  if (!v) return
  toast.add({
    id: 'update',
    title: 'A new version of Phaenti is ready',
    icon: 'i-lucide-sparkles',
    duration: 0,
    actions: [{ label: 'Update', color: 'primary', onClick: () => void $pwa?.updateServiceWorker(true) }],
  })
}, { immediate: true })
watch(() => $pwa?.offlineReady, (v) => {
  if (v) toast.add({ title: 'Ready to work offline', description: 'The app, your places and Cambodia data are saved on this device.', icon: 'i-lucide-cloud-check', color: 'primary' })
}, { immediate: true })

// Suggest installing once, after the first saved place
watch(() => places.value.length, (n, old) => {
  if (standalone.value || n < 1 || (old ?? 0) >= 1) return
  try {
    if (localStorage.getItem('phaenti:install-nudge')) return
    localStorage.setItem('phaenti:install-nudge', '1')
  } catch { return }
  setTimeout(() => toast.add({
    title: 'Keep your map safe',
    description: 'Install Phaenti so it works offline and your places are never cleared.',
    icon: 'i-lucide-smartphone',
    duration: 8000,
    actions: [{ label: 'Install', color: 'primary', onClick: () => (installOpen.value = true) }],
  }), 2600)
})

// ---- Backup ----
async function exportBackup() {
  const data = JSON.stringify(toExport(), null, 2)
  const name = `phaenti-backup-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([data], name, { type: 'application/json' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Phaenti backup' })
      return
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return
  }
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  toast.add({ title: 'Backup saved', description: `${places.value.length} places`, icon: 'i-lucide-download' })
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const r = await importFile(file)
    toast.add({ title: 'Import complete', description: `${r.added} new, ${r.updated} updated`, icon: 'i-lucide-upload', color: 'primary' })
    setTimeout(() => mapApi.value?.fitAll(), 200)
  } catch {
    toast.add({ title: 'Could not read that file', description: 'Use a Phaenti backup or a GeoJSON file.', icon: 'i-lucide-file-x', color: 'error' })
  }
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    ...(standalone.value ? [] : [{ label: 'Install app', icon: 'i-lucide-smartphone', onSelect: () => (installOpen.value = true) }]),
    { label: 'Offline & storage', icon: 'i-lucide-cloud-download', onSelect: () => (offlineOpen.value = true) },
  ],
  [
    { label: 'Back up places', icon: 'i-lucide-download', onSelect: exportBackup, disabled: !places.value.length },
    { label: 'Restore from file', icon: 'i-lucide-upload', onSelect: () => fileInput.value?.click() },
  ],
  [
    { type: 'label', label: 'Cambodia layers' },
    {
      label: 'Boundaries',
      icon: 'i-lucide-square-dashed',
      type: 'checkbox',
      checked: showBoundaries.value,
      onUpdateChecked: (v: boolean) => (showBoundaries.value = v),
      onSelect: (e: Event) => e.preventDefault(),
    },
    {
      label: 'Explored areas',
      icon: 'i-lucide-sparkles',
      type: 'checkbox',
      checked: showExplored.value,
      onUpdateChecked: (v: boolean) => (showExplored.value = v),
      onSelect: (e: Event) => e.preventDefault(),
    },
  ],
  [
    {
      label: colorMode.value === 'dark' ? 'Light map' : 'Dark map',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'),
    },
    { label: 'Add my current location', icon: 'i-lucide-map-pin-plus', onSelect: addHere },
    { label: 'Map credits', icon: 'i-lucide-info', onSelect: () => (creditsOpen.value = true) },
  ],
])

async function addHere() {
  locating.value = true
  const pos = await mapApi.value?.locate()
  locating.value = false
  if (pos) mapView.value?.startDraft(pos.lng, pos.lat, 'location')
  else toast.add({ title: 'Location unavailable', icon: 'i-lucide-locate-off', color: 'warning' })
}

// Back button / Escape closes panels
onMounted(() => {
  const mq = window.matchMedia('(display-mode: standalone)')
  mq.addEventListener?.('change', () => (standalone.value = isStandalone()))
  window.addEventListener('appinstalled', () => {
    standalone.value = true
    useOffline().requestPersist()
  })
  if (standalone.value) useOffline().requestPersist()

  // Home-screen shortcuts: /?action=add, /?action=search
  const params = new URLSearchParams(location.search)
  const action = params.get('action')
  if (action || params.has('source')) history.replaceState(null, '', '/')
  if (action === 'add') setTimeout(startPicking, 400)
  if (action === 'search') setTimeout(() => search.value?.openSearch(), 300)

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (picking.value) picking.value = false
    else if (draft.value || selectedId.value || area.value) closeAll()
  })
})

</script>
