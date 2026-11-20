<template>
  <UApp :toaster="{ position: 'top-center', duration: 2500 }" :locale="isKm ? uiKm : uiEn">
    <main class="fixed inset-0 overflow-hidden">
      <MapView ref="mapView" @moving="moving = $event" />

      <!-- Top: search -->
      <SearchOverlay ref="search" :hidden="picking || measuring" />

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
          <UIcon name="i-lucide-cloud-off" class="size-4" /> {{ t('app.offlinePill') }}
        </motion.button>
      </AnimatePresence>

      <!-- Right: map controls -->
      <motion.div
        class="absolute right-3 z-10 flex flex-col gap-2"
        :style="{ top: 'calc(max(env(safe-area-inset-top), 12px) + 64px)' }"
        :animate="{ x: picking ? 80 : 0 }"
        :transition="spring"
      >
        <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" :aria-label="t('app.mapStyle')" @click="styleOpen = true">
          <UIcon name="i-lucide-layers" class="size-5" />
        </button>
        <UDropdownMenu :items="menu" :content="{ align: 'end', side: 'left', sideOffset: 8 }">
          <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" :aria-label="t('app.menu')">
            <UIcon name="i-lucide-ellipsis" class="size-5" />
          </button>
        </UDropdownMenu>
        <button
          class="shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition"
          :class="measuring ? 'bg-amber-500 text-white' : 'glass'"
          :aria-label="t('menu.measure')"
          @click="toggleMeasure"
        >
          <UIcon name="i-lucide-ruler" class="size-5" />
        </button>
        <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" :aria-label="t('app.showAll')" @click="mapApi?.fitAll()">
          <UIcon name="i-lucide-scan" class="size-5" />
        </button>
        <button class="glass shadow-float grid size-11 place-items-center rounded-2xl active:scale-90 transition" :aria-label="t('app.myLocation')" @click="locate">
          <UIcon :name="locating ? 'i-lucide-loader-circle' : 'i-lucide-locate-fixed'" class="size-5 text-sky-500" :class="locating ? 'animate-spin' : ''" />
        </button>
      </motion.div>

      <!-- Add button -->
      <motion.button
        class="absolute right-4 z-10 grid size-15 place-items-center rounded-[22px] bg-linear-to-br from-emerald-500 to-violet-500 text-white shadow-xl"
        :style="{ bottom: `${PEEK + 16}px` }"
        :aria-label="t('app.addPlace')"
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
                <path d="M22 2C11 2 3 10.4 3 21c0 13.6 15.4 29.3 18 32a1.4 1.4 0 0 0 2 0c2.6-2.7 18-18.4 18-32C41 10.4 33 2 22 2Z" fill="url(#pinG)" class="stroke-white" stroke-width="3" />
                <circle cx="22" cy="21" r="6.5" class="fill-white" />
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
            <p class="mb-3 text-center text-sm text-(--ui-text-muted)">{{ pendingCategory ? t('personal.pickSpot', { label: catLabel(pendingCategory, categoryOf(pendingCategory).label) }) : t('app.movePin') }}</p>
            <div class="grid grid-cols-[auto_1fr] gap-2">
              <UButton color="neutral" variant="soft" size="xl" class="rounded-2xl px-5" @click="picking = false; pendingCategory = null">{{ t('app.cancel') }}</UButton>
              <UButton size="xl" block class="rounded-2xl" icon="i-lucide-map-pin" @click="confirmPick">{{ t('app.useSpot') }}</UButton>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <!-- Bottom sheet -->
      <MeasureBar />

      <BottomSheet v-model:snap="snap" :content-key="contentKey" :hidden="picking || measuring" :peek="PEEK" :dismissible="!!(draft || selected || area || route)" @dismiss="closeAll">
        <template #header>
          <div v-if="!draft && !selected && !area && !route" class="px-5 pb-3">
            <div class="flex items-end justify-between">
              <div>
                <h2 class="text-xl font-semibold tracking-tight">{{ t('app.yourMap') }}</h2>
                <p class="text-sm text-(--ui-text-muted)">
                  <template v-for="(seg, i) in countSegments" :key="i">
                    <AnimatedNumber v-if="seg === '{been}'" :value="counts.been" />
                    <AnimatedNumber v-else-if="seg === '{planned}'" :value="counts.planned" />
                    <template v-else>{{ seg }}</template>
                  </template>
                </p>
              </div>
              <button v-if="!standalone" class="flex items-center gap-1 rounded-full bg-(--ui-primary)/12 px-3 py-1.5 text-xs font-semibold text-(--ui-primary) active:scale-95 transition" @click="installOpen = true">
                <UIcon name="i-lucide-download" class="size-3.5" /> {{ t('app.installApp') }}
              </button>
              <button v-else class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold active:scale-95 transition" :class="online ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600'" @click="offlineOpen = true">
                <UIcon :name="online ? 'i-lucide-cloud-check' : 'i-lucide-cloud-off'" class="size-3.5" /> {{ online ? t('app.offlineReady') : t('app.offline') }}
              </button>
            </div>
            <div class="mt-3 flex gap-1.5">
              <button
                v-for="f in filters"
                :key="f.value"
                class="relative h-9 rounded-full px-3.5 text-sm font-medium transition-colors"
                :class="filter === f.value ? 'text-(--ui-bg)' : 'text-(--ui-text-muted) bg-(--ui-bg-elevated)'"
                @click="filter = isPersonal(f.value) ? 'all' : f.value"
              >
                <motion.span
                  v-if="filter === f.value"
                  layout-id="filter-pill"
                  class="absolute inset-0 rounded-full bg-(--ui-text-highlighted)"
                  :transition="{ type: 'spring', stiffness: 500, damping: 38 }"
                />
                <span class="relative">{{ f.label }}</span>
              </button>
              <motion.button
                class="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-amber-400 to-rose-500 text-white shadow-md"
                :aria-label="t('discover.title')"
                :while-press="{ scale: 0.88 }"
                @click="discoverOpen = true"
              >
                <UIcon name="i-lucide-sparkles" class="size-4.5" />
              </motion.button>
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
            <RouteCard v-if="route" :route="route" />
            <DraftCard v-else-if="draft" :draft="draft" />
            <PlaceDetail v-else-if="selected" :place="selected" />
            <AreaCard v-else-if="area" :area="area" />
            <PlaceList v-else />
          </motion.div>
        </AnimatePresence>
      </BottomSheet>

      <InstallSheet v-model:open="installOpen" />
      <MapStyleSheet v-model:open="styleOpen" />
      <OfflineSheet v-model:open="offlineOpen" />
      <DiscoverSheet />
      <PhotoViewer />

      <input ref="fileInput" type="file" accept=".json,.geojson,application/json,application/geo+json" class="hidden" @change="onImport">
    </main>
  </UApp>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Filter } from '~/composables/useAppState'
import { isStandalone } from '~/composables/useOffline'
import { isPersonal, categoryOf, type CategoryId } from '~/utils/categories'
import { en as uiEn, km as uiKm } from '@nuxt/ui/locale'

const PEEK = 156
const spring = { type: 'spring', stiffness: 420, damping: 38 } as const

const { places, toExport, importFile } = usePlaces()
const { photoViewer, discoverOpen, route, measuring, measurePts, measureClosed, selectedId, draft, area, picking, pendingCategory, searching, filter, snap, mapApi, closeAll, showBoundaries, showExplored } = useAppState()
const colorMode = useColorMode()
const toast = useToast()
const { $pwa } = useNuxtApp()
const { t, isKm, setLang, catLabel } = useLang()
const countSegments = computed(() => t('app.countsLine').split(/(\{been\}|\{planned\})/).filter(Boolean))

const mapView = ref<{ startDraft: (lng: number, lat: number, s: 'map' | 'location', category?: CategoryId) => void }>()
const moving = ref(false)
const locating = ref(false)
const fileInput = ref<HTMLInputElement>()

const selected = computed(() => places.value.find(p => p.id === selectedId.value) ?? null)
const contentKey = computed(() => (route.value ? `r${route.value.to.lat},${route.value.to.lng}` : draft.value ? `d${draft.value.lat},${draft.value.lng}` : selected.value ? `p${selected.value.id}` : area.value ? `a${area.value.code}${area.value.village?.code ?? ''}` : 'list'))
const showFab = computed(() => !picking.value && !measuring.value && !route.value && !draft.value && !selected.value && !area.value && !searching.value && snap.value === 'peek')

const counts = computed(() => {
  let been = 0
  let planned = 0
  for (const p of places.value) {
    if (isPersonal(p.category)) continue
    if (p.status === 'been') been++
    else planned++
  }
  return { been, planned }
})

const filters = computed<{ value: Filter; label: string }[]>(() => [
  { value: 'all', label: `${t('app.all')} ${places.value.length || ''}`.trim() },
  { value: 'been', label: t('app.been') },
  { value: 'planned', label: t('app.wantToGo') },
  ...(isPersonal(filter.value) ? [{ value: filter.value, label: `× ${catLabel(filter.value, categoryOf(filter.value).label)}` }] : []),
])

// If a selected place gets deleted elsewhere, fall back to the list
watch(selected, (s) => {
  if (selectedId.value && !s) selectedId.value = null
})

function toggleMeasure() {
  haptic('tap')
  if (measuring.value) {
    measuring.value = false
    measurePts.value = []
    measureClosed.value = false
    return
  }
  closeAll()
  picking.value = false
  measuring.value = true
}

function startPicking() {
  snap.value = 'peek'
  picking.value = true
}
function confirmPick() {
  const c = mapApi.value?.center()
  if (!c) return
  picking.value = false
  mapView.value?.startDraft(c.lng, c.lat, 'map', pendingCategory.value ?? undefined)
  pendingCategory.value = null
}

async function locate() {
  locating.value = true
  const pos = await mapApi.value?.locate()
  locating.value = false
  if (!pos) toast.add({ title: t('toast.locationOff'), description: t('toast.locationHint'), icon: 'i-lucide-locate-off', color: 'warning' })
}

// ---- Install ----
const { online } = useOffline()
const installOpen = ref(false)
const styleOpen = ref(false)
const offlineOpen = ref(false)
const search = ref<{ openSearch: () => void; close: () => void }>()

// ---- Native-style Back: each open layer closes in turn ----
useBackLayer('sheet', () => snap.value !== 'peek' && !draft.value && !selectedId.value && !area.value, () => (snap.value = 'peek'))
useBackLayer('panel', () => !!(draft.value || selectedId.value || area.value || route.value), () => closeAll())
useBackLayer('measure', () => measuring.value, () => {
  measuring.value = false
  measurePts.value = []
  measureClosed.value = false
})
useBackLayer('picking', () => picking.value, () => {
  picking.value = false
  pendingCategory.value = null
})
useBackLayer('search', () => searching.value, () => search.value?.close())
useBackLayer('style', () => styleOpen.value, () => (styleOpen.value = false))
useBackLayer('offline', () => offlineOpen.value, () => (offlineOpen.value = false))
useBackLayer('install', () => installOpen.value, () => (installOpen.value = false))
useBackLayer('discover', () => discoverOpen.value, () => (discoverOpen.value = false))
useBackLayer('photo', () => !!photoViewer.value, () => (photoViewer.value = null))

// Status-bar colour follows the app theme
watch(() => colorMode.value, (m) => {
  if (!import.meta.client) return
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.removeAttribute('media')
    el.setAttribute('content', m === 'dark' ? '#18181b' : '#fafaf7')
  })
}, { immediate: true })
const standalone = ref(isStandalone())

// New version available: ask, never reload under the user's feet
watch(() => $pwa?.needRefresh, (v) => {
  if (!v) return
  toast.add({
    id: 'update',
    title: t('toast.updateReady'),
    icon: 'i-lucide-sparkles',
    duration: 0,
    actions: [{ label: t('toast.update'), color: 'primary', onClick: () => void $pwa?.updateServiceWorker(true) }],
  })
}, { immediate: true })
watch(() => $pwa?.offlineReady, (v) => {
  if (v) toast.add({ title: t('toast.offlineReady'), description: t('toast.offlineReadyHint'), icon: 'i-lucide-cloud-check', color: 'primary' })
}, { immediate: true })

// Suggest installing once, after the first saved place
watch(() => places.value.length, (n, old) => {
  if (standalone.value || n < 1 || (old ?? 0) >= 1) return
  try {
    if (localStorage.getItem('phaenti:install-nudge')) return
    localStorage.setItem('phaenti:install-nudge', '1')
  } catch { return }
  setTimeout(() => toast.add({
    title: t('toast.nudgeTitle'),
    description: t('toast.nudgeBody'),
    icon: 'i-lucide-smartphone',
    duration: 8000,
    actions: [{ label: t('toast.install'), color: 'primary', onClick: () => (installOpen.value = true) }],
  }), 2600)
})

// ---- Backup ----
async function exportBackup() {
  const data = JSON.stringify(await toExport(), null, 2)
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
  toast.add({ title: t('toast.backupSaved'), description: t('toast.placesCount', { n: places.value.length }), icon: 'i-lucide-download' })
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const r = await importFile(file)
    toast.add({ title: t('toast.importDone'), description: t('toast.importCounts', { added: r.added, updated: r.updated }), icon: 'i-lucide-upload', color: 'primary' })
    setTimeout(() => mapApi.value?.fitAll(), 200)
  } catch {
    toast.add({ title: t('toast.importFail'), description: t('toast.importFailHint'), icon: 'i-lucide-file-x', color: 'error' })
  }
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: isKm.value ? 'English' : 'ភាសាខ្មែរ',
      icon: 'i-lucide-languages',
      kbds: [isKm.value ? 'EN' : 'KH'],
      onSelect: () => setLang(isKm.value ? 'en' : 'km'),
    },
  ],
  [
    ...(standalone.value ? [] : [{ label: t('menu.install'), icon: 'i-lucide-smartphone', onSelect: () => (installOpen.value = true) }]),
    { label: t('menu.offline'), icon: 'i-lucide-cloud-download', onSelect: () => (offlineOpen.value = true) },
  ],
  [
    { label: t('menu.backup'), icon: 'i-lucide-download', onSelect: exportBackup, disabled: !places.value.length },
    { label: t('menu.restore'), icon: 'i-lucide-upload', onSelect: () => fileInput.value?.click() },
  ],
  [
    { label: t('menu.discover'), icon: 'i-lucide-sparkles', onSelect: () => (discoverOpen.value = true) },
    { label: t('menu.styles'), icon: 'i-lucide-layers', onSelect: () => (styleOpen.value = true) },
  ],
  [
    {
      label: colorMode.value === 'dark' ? t('menu.lightMode') : t('menu.darkMode'),
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'),
    },
    { label: t('menu.addHere'), icon: 'i-lucide-map-pin-plus', onSelect: addHere },
    { label: t('menu.measure'), icon: 'i-lucide-ruler', onSelect: () => { if (!measuring.value) toggleMeasure() } },
  ],
])

async function addHere() {
  locating.value = true
  const pos = await mapApi.value?.locate()
  locating.value = false
  if (pos) mapView.value?.startDraft(pos.lng, pos.lat, 'location')
  else toast.add({ title: t('toast.locationOff'), icon: 'i-lucide-locate-off', color: 'warning' })
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
    if (photoViewer.value) photoViewer.value = null
    else if (picking.value) picking.value = false
    else if (draft.value || selectedId.value || area.value) closeAll()
  })
})

</script>
