<template>
  <div>
    <!-- Backdrop -->
    <AnimatePresence>
      <motion.div
        v-if="open"
        key="backdrop"
        class="fixed inset-0 z-40 bg-(--ui-bg)/70 backdrop-blur-xl"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.22 }"
        @click="close"
      />
    </AnimatePresence>

    <motion.div
      class="pt-safe fixed inset-x-0 top-0 z-50 px-3"
      :class="open ? 'bottom-0 flex flex-col' : ''"
      :animate="{ y: hidden ? -110 : 0, opacity: hidden ? 0 : 1 }"
      :transition="{ type: 'spring', stiffness: 420, damping: 38 }"
    >
      <!-- Search row -->
      <div class="mx-auto flex w-full max-w-xl items-center gap-2">
        <motion.div
          class="glass shadow-float flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl pl-3.5 pr-1.5"
          :animate="{ scale: open ? 1 : 1 }"
        >
          <AnimatePresence mode="wait" :initial="false">
            <motion.button
              v-if="open"
              key="back"
              class="-ml-1 grid size-8 shrink-0 place-items-center rounded-full text-(--ui-text-muted)"
              :aria-label="t('search.back')"
              :initial="{ opacity: 0, rotate: -90 }"
              :animate="{ opacity: 1, rotate: 0 }"
              :exit="{ opacity: 0, rotate: 90 }"
              :transition="{ duration: 0.15 }"
              @click="close"
            >
              <UIcon name="i-lucide-arrow-left" class="size-5" />
            </motion.button>
            <motion.span
              v-else
              key="icon"
              class="grid size-6 shrink-0 place-items-center"
              :initial="{ opacity: 0, scale: 0.6 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.6 }"
              :transition="{ duration: 0.15 }"
            >
              <UIcon name="i-lucide-search" class="size-5 text-(--ui-text-muted)" />
            </motion.span>
          </AnimatePresence>
          <input
            ref="input"
            v-model="q"
            type="search"
            inputmode="search"
            enterkeyhint="search"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="placeholder"
            class="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-(--ui-text-dimmed)"
            @focus="openSearch"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="pick(active)"
            @keydown.esc="close"
          >
          <div v-if="loading" class="mr-1 size-4 shrink-0 rounded-full border-2 border-(--ui-primary) border-t-transparent animate-spin" />
          <Transition enter-from-class="opacity-0 scale-75" leave-to-class="opacity-0 scale-75" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
            <button v-if="q || quick" class="grid size-9 shrink-0 place-items-center rounded-full text-(--ui-text-muted) active:scale-90 transition" :aria-label="t('search.clear')" @mousedown.prevent @click="clear">
              <UIcon name="i-lucide-x" class="size-4.5" />
            </button>
            <button v-else-if="!open" class="grid size-9 shrink-0 place-items-center rounded-full text-(--ui-text-muted) active:scale-90 transition" :aria-label="t('search.paste')" @click="pasteFromClipboard">
              <UIcon name="i-lucide-clipboard-paste" class="size-4.5" />
            </button>
          </Transition>
        </motion.div>
      </div>

      <!-- Category chips under the search bar, like Google Maps -->
      <AnimatePresence>
        <motion.div
          v-if="!open && chips"
          key="chips"
          class="-mx-3 mt-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          :initial="{ opacity: 0, y: -6 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -6 }"
        >
          <div class="mx-auto flex w-max gap-1.5 pb-1">
            <button
              v-for="c in QUICK_SEARCHES"
              :key="quickKey(c)"
              class="glass shadow-float flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-[13px] font-medium active:scale-95 transition-transform"
              @click="startQuick(c)"
            >
              <span class="grid size-6 place-items-center rounded-full text-white" :style="{ background: chipBg(c) }">
                <UIcon :name="`i-lucide-${chipIcon(c)}`" class="size-3.5" />
              </span>
              {{ quickLabel(quickKey(c), c.label) }}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      <!-- Panel -->
      <AnimatePresence>
        <motion.div
          v-if="open"
          key="panel"
          class="mx-auto mt-2 w-full max-w-xl min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-safe [scrollbar-width:none]"
          :initial="{ opacity: 0, y: -10 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -10 }"
          :transition="{ duration: 0.2 }"
          @mousedown.prevent
        >
          <!-- Idle: shortcuts, recents, provinces -->
          <template v-if="!q.trim() && !quick">
            <section class="mt-1 mb-5">
              <PersonalShortcuts @picked="close" />
            </section>
            <section>
              <h3 class="section">{{ t('search.nearby') }}</h3>
              <div class="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div class="grid w-max grid-flow-col grid-rows-2 gap-2">
                  <motion.button
                    v-for="(c, i) in QUICK_SEARCHES"
                    :key="quickKey(c)"
                    class="flex h-11 items-center gap-2 rounded-2xl bg-(--ui-bg-elevated) pl-1.5 pr-3.5 text-sm font-medium active:scale-95 transition-transform"
                    :initial="{ opacity: 0, y: 8 }"
                    :animate="{ opacity: 1, y: 0 }"
                    :transition="{ delay: i * 0.02 }"
                    @click="runQuick(c)"
                  >
                    <span class="grid size-8 place-items-center rounded-xl text-white" :style="{ background: chipBg(c) }">
                      <UIcon :name="`i-lucide-${chipIcon(c)}`" class="size-4.5" />
                    </span>
                    {{ quickLabel(quickKey(c), c.label) }}
                  </motion.button>
                </div>
              </div>
            </section>

            <section v-if="visibleRecents.length" class="mt-5">
              <div class="flex items-center justify-between">
                <h3 class="section">{{ t('search.recent') }}</h3>
                <button class="px-1 text-xs font-medium text-(--ui-text-muted)" @click="clearRecents">{{ t('search.clearRecent') }}</button>
              </div>
              <div class="card">
                <button v-for="(r, i) in visibleRecents" :key="i" class="row" @click="runRecent(r)">
                  <span class="icon bg-(--ui-bg-elevated) text-(--ui-text-muted)"><UIcon name="i-lucide-history" class="size-4.5" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[15px] font-medium">{{ isKm && r.km ? r.km : r.title }}</span>
                    <span v-if="r.subtitle" class="block truncate text-[13px] text-(--ui-text-muted)">{{ isKm && r.subKm ? r.subKm : r.subtitle }}</span>
                  </span>
                  <UIcon name="i-lucide-arrow-up-left" class="size-4 text-(--ui-text-dimmed)" />
                </button>
              </div>
            </section>

            <section v-if="provinces.length" class="mt-5">
              <h3 class="section">{{ t('search.explore') }}</h3>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="p in provinces"
                  :key="p.code"
                  class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium active:scale-95 transition"
                  :class="(adminCounts.been.get(p.code) ?? 0) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-(--ui-border) bg-(--ui-bg)/60'"
                  @click="goArea(p.code)"
                >
                  <template v-if="isKm"><span lang="km">{{ p.km }}</span><span class="text-(--ui-text-dimmed)">{{ p.name }}</span></template>
                  <template v-else>{{ p.name }}<span class="text-(--ui-text-dimmed)" lang="km">{{ p.km }}</span></template>
                </button>
              </div>
            </section>

            <p class="mt-6 px-1 text-center text-xs text-(--ui-text-dimmed)">
              {{ t('search.tip') }} <span class="font-mono">11.5564, 104.9282</span>
            </p>
          </template>

          <!-- Results -->
          <template v-else>
            <div v-if="quick" class="mb-2 flex items-center gap-2 px-1">
              <span class="grid size-7 place-items-center rounded-lg text-white" :style="{ background: chipBg(quick) }">
                <UIcon :name="`i-lucide-${chipIcon(quick)}`" class="size-4" />
              </span>
              <p class="text-sm font-semibold">{{ t('search.nearCentre', { what: quickLabel(quickKey(quick), quick.label) }) }}</p>
            </div>

            <section v-for="sec in sections" :key="sec.title" class="mb-4">
              <h3 v-if="sec.title" class="section">{{ sec.title }}</h3>
              <div class="card">
                <motion.button
                  v-for="it in sec.items"
                  :key="it.key"
                  class="row"
                  :class="it.index === active ? 'bg-(--ui-bg-elevated)' : ''"
                  :initial="{ opacity: 0, x: -6 }"
                  :animate="{ opacity: 1, x: 0 }"
                  :transition="{ delay: Math.min(it.index, 10) * 0.02, duration: 0.18 }"
                  @mouseenter="active = it.index"
                  @click="pick(it.index)"
                >
                  <img v-if="it.pin" :src="it.pin" alt="" class="h-10 w-8 shrink-0">
                  <span v-else class="icon" :style="{ background: `${it.color}1f`, color: it.color }">
                    <UIcon :name="it.icon" class="size-4.5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[15px] font-medium">
                      <template v-for="(seg, j) in highlight(it.title)" :key="j"><b v-if="seg.hit" class="font-semibold text-(--ui-primary)">{{ seg.text }}</b><template v-else>{{ seg.text }}</template></template>
                      <span v-if="it.km" class="ml-1.5 font-normal text-(--ui-text-muted)" lang="km">{{ it.km }}</span>
                    </span>
                    <span v-if="it.subtitle" class="block truncate text-[13px] text-(--ui-text-muted)">{{ it.subtitle }}</span>
                  </span>
                  <span v-if="it.meta" class="shrink-0 text-xs font-medium text-(--ui-text-dimmed)">{{ it.meta }}</span>
                </motion.button>
              </div>
            </section>

            <div v-if="blocked" class="px-4 py-10 text-center">
              <UIcon name="i-lucide-ban" class="mx-auto size-8 text-(--ui-text-dimmed)" />
              <p class="mt-2 text-sm text-(--ui-text-muted)">{{ t('search.blocked') }}</p>
            </div>
            <div v-else-if="!flat.length && !loading" class="px-4 py-10 text-center">
              <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-(--ui-text-dimmed)" />
              <p class="mt-2 text-sm text-(--ui-text-muted)">{{ error || t('search.noMatches') }}</p>
            </div>
          </template>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  </div>
</template>

<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { refDebounced } from '@vueuse/core'
import type { GeoResult } from '~/composables/useGeocode'
import { QUICK_SEARCHES, quickKey, type QuickSearch, categoryOf, isPersonal, type CategoryId } from '~/utils/categories'
import { pinDataUrl } from '~/utils/pins'
import { adminCounts } from '~/composables/useAdmin'
import { isBlockedText, isHiddenPoint } from '~/composables/useHidden'

defineProps<{ hidden?: boolean; chips?: boolean }>()
const { places } = usePlaces()
const { mapApi, select, openDraft, openArea, searching } = useAppState()
const admin = useAdmin()
const toast = useToast()

const input = ref<HTMLInputElement>()
const q = ref('')
const open = ref(false)
const loading = ref(false)
const error = ref('')
const remote = shallowRef<GeoResult[]>([])
const quick = ref<QuickSearch | null>(null)
const chipIcon = (c: QuickSearch) => c.icon ?? cat(c.id).icon
const chipBg = (c: QuickSearch) => `linear-gradient(135deg, ${c.color ?? cat(c.id).color}, ${c.color2 ?? c.color ?? cat(c.id).color2})`
const active = ref(0)
const origin = ref<{ lat: number; lng: number } | null>(null)

watch(open, v => (searching.value = v))
const cat = (id: CategoryId) => categoryOf(id)
const { t, isKm, catLabel, quickLabel } = useLang()

const placeholders = computed(() => [t('search.ph1'), t('search.ph2'), t('search.ph3')])
const phIndex = ref(0)
const placeholder = computed(() => placeholders.value[phIndex.value % placeholders.value.length])
let phTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => (phTimer = setInterval(() => !open.value && phIndex.value++, 4000)))
onBeforeUnmount(() => clearInterval(phTimer))

const provinces = computed(() => {
  if (!admin.ready.value) return []
  return Object.entries(admin.index.value!.areas)
    .filter(([, a]) => a[0] === 1)
    .map(([code, a]) => ({ code, name: a[1], km: a[2] }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

// ---------------- Recents ----------------
interface Recent { kind: 'geo' | 'place' | 'area' | 'village' | 'coords'; title: string; subtitle?: string; subKm?: string; lat?: number; lng?: number; code?: string; km?: string; category?: CategoryId; id?: string }
const RKEY = 'phaenti:recent'
const recents = ref<Recent[]>([])
try {
  recents.value = (JSON.parse(localStorage.getItem(RKEY) || '[]') as Recent[]).filter(r => !isBlockedRecent(r))
  localStorage.setItem(RKEY, JSON.stringify(recents.value))
} catch { /* ignore */ }
function isBlockedRecent(r: Recent) {
  return isBlockedText(r.title) || isBlockedText(r.subtitle) || (r.lat != null && r.lng != null && isHiddenPoint(r.lat, r.lng))
}
function remember(r: Recent) {
  recents.value = [r, ...recents.value.filter(x => !(x.title === r.title && x.kind === r.kind))].slice(0, 8)
  try { localStorage.setItem(RKEY, JSON.stringify(recents.value)) } catch { /* ignore */ }
}
// Re-checked on render too: the country outline loads a moment after start
const visibleRecents = computed(() => recents.value.filter(r => !isBlockedRecent(r)))
function clearRecents() {
  recents.value = []
  try { localStorage.removeItem(RKEY) } catch { /* ignore */ }
}

// ---------------- Results ----------------
interface Item {
  key: string
  index: number
  title: string
  subtitle?: string
  km?: string
  meta?: string
  icon: string
  color: string
  pin?: string
  run: () => void
  recent?: Recent
}

const debounced = refDebounced(q, 260)
const blocked = computed(() => isBlockedText(q.value))
const coords = computed(() => parseCoordinates(q.value))
const gmaps = computed(() => parseGoogleMapsUrl(q.value))
const localHits = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (s.length < 2 || blocked.value) return []
  return places.value.filter(p =>
    p.name.toLowerCase().includes(s) || p.address.toLowerCase().includes(s) || p.notes.toLowerCase().includes(s)
    || (p.person ?? '').toLowerCase().includes(s)
    || (isPersonal(p.category) && (p.category.startsWith(s) || catLabel(p.category, '').toLowerCase().includes(s))),
  ).slice(0, 6)
})
const adminHits = computed(() => (admin.ready.value && !blocked.value && !coords.value && !gmaps.value ? admin.search(q.value, 6) : []))

const sections = computed(() => {
  let i = 0
  const secs: { title: string; items: Item[] }[] = []
  const push = (title: string, items: Omit<Item, 'index'>[]) => {
    if (items.length) secs.push({ title, items: items.map(x => ({ ...x, index: i++ })) })
  }
  const dist = (lat: number, lng: number) => (origin.value ? formatDistance(distanceKm(origin.value, { lat, lng })) : '')

  if (blocked.value) return secs
  if (!quick.value) {
    const smart: Omit<Item, 'index'>[] = []
    const g = gmaps.value
    if (g === 'short') {
      smart.push({ key: 'short', title: t('search.shortLink'), subtitle: t('search.shortLinkHint'), icon: 'i-lucide-link', color: '#f59e0b', run: () => {} })
    } else if (g) {
      const title = g.name || t('search.googleLocation')
      smart.push({ key: 'gm', title, subtitle: t('search.fromGoogle', { coords: formatCoords(g.lat, g.lng) }), icon: 'i-lucide-link', color: '#4285f4', run: () => draftAt(g.lat, g.lng, title, formatCoords(g.lat, g.lng), 'other'), recent: { kind: 'coords', title, lat: g.lat, lng: g.lng } })
    } else if (coords.value) {
      const { lat, lng } = coords.value
      smart.push({ key: 'coords', title: formatCoords(lat, lng), subtitle: t('search.dropHere'), icon: 'i-lucide-crosshair', color: '#0ea5e9', run: () => draftAt(lat, lng, t('place.pinnedLocation'), formatCoords(lat, lng), 'other'), recent: { kind: 'coords', title: formatCoords(lat, lng), lat, lng } })
    }
    push('', smart)

    push(t('search.myPlaces'), localHits.value.map(p => ({
      key: `l${p.id}`, title: p.name, subtitle: `${catLabel(p.category, cat(p.category).label)} · ${p.address || formatCoords(p.lat, p.lng)}`,
      icon: '', color: '', pin: pinDataUrl(p.category, p.status), meta: dist(p.lat, p.lng),
      run: () => { select(p.id); mapApi.value?.flyTo(p.lng, p.lat, 15) },
      recent: { kind: 'place', title: p.name, subtitle: p.address, id: p.id, lat: p.lat, lng: p.lng },
    })))

    push(t('search.cambodia'), adminHits.value.map(h => ({
      key: `a${h.code}`,
      title: isKm.value && h.km ? h.km : h.name,
      km: isKm.value && h.km ? h.name : h.km,
      subtitle: isKm.value ? [h.unitKm, h.subKm].filter(Boolean).join(' · ') : [h.unit, h.sub].filter(Boolean).join(' · '),
      icon: h.level === 1 ? 'i-lucide-flag' : h.level === 2 ? 'i-lucide-building-2' : h.level === 3 ? 'i-lucide-map' : 'i-lucide-home',
      color: h.level === 1 ? '#7c3aed' : h.level === 2 ? '#2563eb' : h.level === 3 ? '#0d9488' : '#d97706',
      run: () => (h.level === 4 ? goVillage(h.code, h.name, h.km) : goArea(h.code)),
      recent: { kind: h.level === 4 ? 'village' : 'area', title: h.name, subtitle: [h.unit, h.sub].filter(Boolean).join(' · '), code: h.code, km: h.km, subKm: [h.unitKm, h.subKm].filter(Boolean).join(' · ') },
    })))
  }

  push(quick.value ? '' : t('search.places'), remote.value.map(r => ({
    key: `r${r.id}`, title: r.name, subtitle: [r.kind && r.category === 'other' ? r.kind : catLabel(r.category, cat(r.category).label), r.subtitle].filter(Boolean).join(' · '),
    icon: `i-lucide-${cat(r.category).icon}`, color: cat(r.category).color, meta: dist(r.lat, r.lng),
    run: () => draftAt(r.lat, r.lng, r.name, r.subtitle, r.category),
    recent: { kind: 'geo', title: r.name, subtitle: r.subtitle, lat: r.lat, lng: r.lng, category: r.category },
  })))
  return secs
})
const flat = computed(() => sections.value.flatMap(s => s.items))
watch(flat, () => (active.value = 0))

let ctrl: AbortController | null = null
async function runRemote(text: string, tags?: string[]) {
  ctrl?.abort()
  error.value = ''
  ctrl = new AbortController()
  loading.value = true
  origin.value = mapApi.value?.center() ?? null
  try {
    remote.value = await searchPlaces(text, { near: origin.value ?? undefined, tags, limit: tags ? 15 : 7, signal: ctrl.signal })
    if (tags && origin.value) remote.value = [...remote.value].sort((a, b) => distanceKm(origin.value!, a) - distanceKm(origin.value!, b))
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      remote.value = []
      error.value = navigator.onLine ? t('search.unavailable') : t('search.offline')
    }
  } finally {
    loading.value = false
  }
}

watch(debounced, (s) => {
  if (quick.value) return
  const text = s.trim()
  if (text.length < 2 || coords.value || gmaps.value || isBlockedText(text)) {
    ctrl?.abort()
    remote.value = []
    loading.value = false
    return
  }
  runRemote(text)
})
watch(q, (v) => {
  if (v && quick.value) quick.value = null
  origin.value = mapApi.value?.center() ?? null
})

function startQuick(c: QuickSearch) {
  haptic('tap')
  openSearch()
  origin.value = mapApi.value?.center() ?? null
  runQuick(c)
}
function runQuick(c: QuickSearch) {
  quick.value = c
  q.value = ''
  remote.value = []
  runRemote(c.q, c.tags)
}

// ---------------- Actions ----------------
function draftAt(lat: number, lng: number, name: string, address: string, category: CategoryId) {
  if (openDraft({ name, category, address, lat, lng, source: 'search' })) mapApi.value?.flyTo(lng, lat, 16)
}
function goArea(code: string) {
  const a = admin.area(code)
  openArea({ code })
  if (a?.bbox) mapApi.value?.fitBounds(a.bbox, 15)
  close()
}
function goVillage(code: string, name: string, km: string) {
  const m = admin.mappable(code, 4)
  if (!m) return
  openArea({ code: m.code, village: { code, name, km } })
  if (m.bbox) mapApi.value?.fitBounds(m.bbox, 15)
}

function pick(i: number) {
  const it = flat.value[i]
  if (!it) return
  it.run()
  if (it.recent) remember(it.recent)
  if (it.key !== 'short') close()
}

function runRecent(r: Recent) {
  admin.loadIndex().then(() => {
    if (r.kind === 'place' && r.id && places.value.some(p => p.id === r.id)) {
      select(r.id)
      if (r.lat != null) mapApi.value?.flyTo(r.lng!, r.lat, 15)
    } else if (r.kind === 'area' && r.code) goArea(r.code)
    else if (r.kind === 'village' && r.code) goVillage(r.code, r.title, r.km ?? '')
    else if (r.lat != null && r.lng != null) draftAt(r.lat, r.lng, r.title, r.subtitle ?? '', r.category ?? 'other')
    remember(r)
    close()
  })
}

function move(d: number) {
  const n = flat.value.length
  if (n) active.value = (active.value + d + n) % n
}

function openSearch() {
  open.value = true
  admin.loadIndex().catch(() => {})
}
function close() {
  open.value = false
  quick.value = null
  q.value = ''
  remote.value = []
  input.value?.blur()
}
function clear() {
  q.value = ''
  quick.value = null
  remote.value = []
  input.value?.focus()
}

async function pasteFromClipboard() {
  try {
    const t = await navigator.clipboard.readText()
    if (t) {
      q.value = t.trim()
      input.value?.focus()
    }
  } catch {
    input.value?.focus()
    toast.add({ title: t('search.pasteHint'), icon: 'i-lucide-clipboard', duration: 2500 })
  }
}

function highlight(text: string) {
  const s = q.value.trim()
  if (!s) return [{ text, hit: false }]
  const idx = text.toLowerCase().indexOf(s.toLowerCase())
  if (idx < 0) return [{ text, hit: false }]
  return [
    { text: text.slice(0, idx), hit: false },
    { text: text.slice(idx, idx + s.length), hit: true },
    { text: text.slice(idx + s.length), hit: false },
  ]
}

defineExpose({ openSearch: () => { openSearch(); input.value?.focus() }, close })
</script>

<style scoped>
@reference "../assets/css/main.css";
.section { @apply mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--ui-text-dimmed); }
.card { @apply overflow-hidden rounded-2xl border border-(--ui-border)/60 bg-(--ui-bg)/80 py-1 shadow-sm; }
.row { @apply flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-(--ui-bg-elevated); }
.icon { @apply grid size-10 shrink-0 place-items-center rounded-xl; }
</style>
