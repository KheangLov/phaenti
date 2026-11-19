<template>
  <div class="px-5 pt-1 pb-6">
    <div v-if="!info" class="py-10 text-center text-sm text-(--ui-text-muted)">{{ t('area.loading') }}</div>

    <template v-else>
      <!-- Title -->
      <div class="flex items-start gap-3">
        <div class="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-md" :style="{ background: badge.bg }">
          <UIcon :name="badge.icon" class="size-6" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--ui-text-dimmed)">
            <template v-if="isKm">{{ unitKm || unitEn }}</template>
            <template v-else><span v-if="unitKm" class="mr-1 normal-case tracking-normal">{{ unitKm }} ·</span>{{ unitEn }}</template>
          </p>
          <h2 class="truncate text-xl font-semibold leading-tight tracking-tight">{{ isKm && titleKm ? titleKm : title }}</h2>
          <p v-if="titleKm" class="truncate text-base text-(--ui-text-muted)">{{ isKm ? title : titleKm }}</p>
        </div>
        <UButton icon="i-lucide-x" color="neutral" variant="soft" class="rounded-full" :aria-label="t('place.close')" @click="select(null)" />
      </div>

      <!-- Breadcrumb -->
      <div v-if="crumbs.length" class="mt-3 flex flex-wrap items-center gap-1 text-xs">
        <template v-for="(c, i) in crumbs" :key="c.code">
          <UIcon v-if="i" name="i-lucide-chevron-right" class="size-3 text-(--ui-text-dimmed)" />
          <button class="rounded-full bg-(--ui-bg-elevated) px-2.5 py-1 font-medium text-(--ui-text-muted) active:scale-95 transition" @click="go(c.code)">
            {{ pick(c.name, c.km) }}
          </button>
        </template>
      </div>

      <!-- Stats -->
      <div class="mt-4 grid grid-cols-3 gap-2">
        <div class="rounded-2xl bg-(--ui-bg-elevated) p-3">
          <p class="text-xl font-bold tabular-nums"><AnimatedNumber :value="stats.all" /></p>
          <p class="text-[11px] font-medium text-(--ui-text-muted)">{{ t('area.yourPlaces') }}</p>
        </div>
        <div class="rounded-2xl bg-emerald-500/10 p-3">
          <p class="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400"><AnimatedNumber :value="stats.been" /></p>
          <p class="text-[11px] font-medium text-(--ui-text-muted)">{{ t('area.been') }}</p>
        </div>
        <div v-if="kids.length" class="rounded-2xl bg-violet-500/10 p-3">
          <p class="text-xl font-bold tabular-nums text-violet-600 dark:text-violet-400">
            <AnimatedNumber :value="kidsExplored" /><span class="text-xs font-medium text-(--ui-text-dimmed)">/{{ kids.length }}</span>
          </p>
          <p class="text-[11px] font-medium text-(--ui-text-muted)">{{ t('area.explored', { what: kidLabel }) }}</p>
        </div>
        <div v-else class="rounded-2xl bg-violet-500/10 p-3">
          <p class="text-xl font-bold tabular-nums text-violet-600 dark:text-violet-400"><AnimatedNumber :value="stats.all - stats.been" /></p>
          <p class="text-[11px] font-medium text-(--ui-text-muted)">{{ t('area.wantToGo') }}</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-3 grid grid-cols-3 gap-2">
        <button class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition" @click="zoom">
          <UIcon name="i-lucide-scan" class="size-5 text-violet-500" />
          {{ t('area.zoomTo') }}
        </button>
        <button v-if="area.village" class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition" @click="findVillage">
          <UIcon :name="finding ? 'i-lucide-loader-circle' : 'i-lucide-search'" class="size-5 text-sky-500" :class="finding ? 'animate-spin' : ''" />
          {{ t('area.findVillage') }}
        </button>
        <button v-else class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition" @click="addHere">
          <UIcon name="i-lucide-map-pin-plus" class="size-5 text-emerald-500" />
          {{ t('area.addPlace') }}
        </button>
        <a
          v-if="info.wiki"
          :href="info.wiki"
          target="_blank"
          rel="noopener"
          class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition"
        >
          <UIcon name="i-lucide-book-open" class="size-5 text-amber-500" />
          {{ t('area.wikipedia') }}
        </a>
        <a
          v-else
          :href="`https://www.google.com/maps/search/${encodeURIComponent(`${title}, Cambodia`)}`"
          target="_blank"
          rel="noopener"
          class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition"
        >
          <UIcon name="i-lucide-navigation" class="size-5 text-sky-500" />
          {{ t('area.googleMaps') }}
        </a>
      </div>

      <!-- Your places here -->
      <div v-if="here.length" class="mt-5">
        <h3 class="mb-1 text-sm font-semibold">{{ t('area.placesHere') }}</h3>
        <ul class="-mx-2">
          <li v-for="p in here.slice(0, 6)" :key="p.id">
            <button class="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left active:bg-(--ui-bg-elevated)" @click="openPlace(p)">
              <img :src="pinDataUrl(p.category, p.status)" alt="" class="h-9 w-7.5 shrink-0">
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ p.name }}</span>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-(--ui-text-dimmed)" />
            </button>
          </li>
        </ul>
        <p v-if="here.length > 6" class="px-1 text-xs text-(--ui-text-dimmed)">{{ t('area.more', { n: here.length - 6 }) }}</p>
      </div>

      <!-- Children grid -->
      <div v-if="kids.length" class="mt-5">
        <h3 class="mb-2 text-sm font-semibold">{{ kidLabel }} <span class="font-normal text-(--ui-text-dimmed)">({{ kids.length }})</span></h3>
        <div class="flex flex-wrap gap-1.5">
          <motion.button
            v-for="(k, i) in kids"
            :key="k.code"
            class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium active:scale-95"
            :class="beenIn(k.code) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-(--ui-border) text-(--ui-text-muted)'"
            :initial="{ opacity: 0, scale: 0.9 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ delay: Math.min(i, 30) * 0.012 }"
            @click="go(k.code)"
          >
            <span class="size-1.5 rounded-full" :class="beenIn(k.code) ? 'bg-emerald-500' : 'bg-(--ui-text-dimmed)/40'" />
            {{ pick(k.name, k.km) }}
          </motion.button>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import type { Place } from '~/utils/db'
import { pinDataUrl } from '~/utils/pins'
import { adminCounts, placeAdmin, LEVEL_LABEL } from '~/composables/useAdmin'
import type { AreaSelection } from '~/composables/useAppState'

const props = defineProps<{ area: AreaSelection }>()
const { select, openArea, openDraft, mapApi, picking, snap } = useAppState()
const { places } = usePlaces()
const admin = useAdmin()
const toast = useToast()
const { t, isKm, pick } = useLang()

onMounted(() => admin.loadIndex().catch(() => {}))

const info = computed(() => (admin.ready.value ? admin.area(props.area.code) : null))
const level = computed(() => info.value?.level ?? 3)
const title = computed(() => props.area.village?.name ?? info.value?.name ?? '')
const titleKm = computed(() => props.area.village?.km ?? info.value?.km ?? '')
const unitEn = computed(() => (props.area.village ? 'Village' : info.value?.unitEn ?? LEVEL_LABEL[level.value]))
const unitKm = computed(() => (props.area.village ? 'ភូមិ' : info.value?.unitKm ?? ''))

const badge = computed(() => {
  if (props.area.village) return { icon: 'i-lucide-home', bg: 'linear-gradient(135deg,#f59e0b,#d97706)' }
  if (level.value === 1) return { icon: 'i-lucide-flag', bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }
  if (level.value === 2) return { icon: 'i-lucide-building-2', bg: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }
  return { icon: 'i-lucide-map', bg: 'linear-gradient(135deg,#10b981,#0d9488)' }
})

const crumbs = computed(() => {
  if (!info.value) return []
  const codes = props.area.village ? [props.area.code, ...admin.parentsOf(props.area.code, info.value.level)] : admin.parentsOf(props.area.code, info.value.level)
  return codes.map(c => admin.area(c)).filter((x): x is NonNullable<typeof x> => !!x).reverse()
})

const stats = computed(() => ({
  all: adminCounts.value.all.get(props.area.code) ?? 0,
  been: adminCounts.value.been.get(props.area.code) ?? 0,
}))

const kids = computed(() => (props.area.village ? [] : admin.children(props.area.code)))
const kidLabel = computed(() => (level.value === 1 ? t('explorer.districts') : t('explorer.communes')))
const beenIn = (code: string) => (adminCounts.value.been.get(code) ?? 0) > 0
const kidsExplored = computed(() => kids.value.filter(k => beenIn(k.code)).length)

const here = computed(() => places.value.filter((p) => {
  const a = placeAdmin.value.get(p.id)
  return a && (a.p === props.area.code || a.d === props.area.code || a.c === props.area.code)
}))

function zoom() {
  if (info.value?.bbox) mapApi.value?.fitBounds(info.value.bbox, 15)
}
function go(code: string) {
  openArea({ code })
  const a = admin.area(code)
  if (a?.bbox) mapApi.value?.fitBounds(a.bbox, 15)
}
function openPlace(p: Place) {
  select(p.id)
  mapApi.value?.flyTo(p.lng, p.lat, 15)
}
function addHere() {
  const c = info.value?.center
  if (c) mapApi.value?.flyTo(c[0], c[1], Math.max(mapApi.value.zoom(), level.value === 1 ? 9 : level.value === 2 ? 11 : 13))
  select(null)
  snap.value = 'peek'
  picking.value = true
}

const finding = ref(false)
async function findVillage() {
  const v = props.area.village
  const a = info.value
  if (!v || !a?.bbox) return
  finding.value = true
  try {
    const prov = admin.area(v.code.slice(0, 2))?.name ?? ''
    const res = await searchPlaces(`${v.name} ${prov}`, { near: { lat: a.center![1], lng: a.center![0] }, limit: 10 })
    const b = a.bbox
    const pad = 0.03
    const hit = res.find(r => r.lng >= b[0] - pad && r.lng <= b[2] + pad && r.lat >= b[1] - pad && r.lat <= b[3] + pad)
    if (hit) {
      openDraft({ name: t('area.villageName', { name: isKm.value && v.km ? v.km : v.name }), category: 'other', address: `${a.name}, ${prov}`, lat: hit.lat, lng: hit.lng, source: 'search' })
      mapApi.value?.flyTo(hit.lng, hit.lat, 15)
    } else {
      toast.add({ title: t('area.notOnMap'), description: t('area.notOnMapHint', { name: isKm.value ? `${a.unitKm}${a.km}` : `${a.name} ${a.unitEn.toLowerCase()}` }), icon: 'i-lucide-map', color: 'warning' })
      zoom()
    }
  } catch {
    toast.add({ title: t('area.searchDown'), description: t('area.checkConnection'), icon: 'i-lucide-wifi-off', color: 'warning' })
  } finally {
    finding.value = false
  }
}
</script>
