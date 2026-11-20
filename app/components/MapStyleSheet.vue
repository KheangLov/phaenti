<template>
  <UDrawer v-model:open="open" :title="t('styles.title')" :description="t('styles.desc')">
    <template #body>
      <div class="pb-safe">
        <!-- Satellite options -->
        <div v-if="current.satellite" class="mb-4 divide-y divide-(--ui-border) overflow-hidden rounded-2xl border border-(--ui-border)">
          <div class="px-4 py-3">
            <p class="mb-2 flex items-center gap-2 text-sm"><UIcon name="i-lucide-satellite" class="size-5 text-violet-500" />{{ t('styles.satSource') }}</p>
            <div class="grid grid-cols-2 gap-1.5 rounded-xl bg-(--ui-bg-elevated) p-1">
              <button
                v-for="o in (['clarity', 'latest'] as const)"
                :key="o"
                class="rounded-lg px-2 py-2 text-left transition"
                :class="satSource === o ? 'bg-(--ui-bg) shadow-sm' : 'text-(--ui-text-muted)'"
                @click="satSource = o"
              >
                <span class="block text-[13px] font-semibold">{{ t(`styles.sat_${o}`) }}</span>
                <span class="block text-[11px] text-(--ui-text-muted)">{{ t(`styles.sat_${o}Hint`) }}</span>
              </button>
            </div>
          </div>
          <label class="flex items-center gap-3 px-4 py-3">
            <UIcon name="i-lucide-scan-eye" class="size-5 text-emerald-500" />
            <span class="flex-1">
              <span class="block text-sm">{{ t('styles.satHD') }}</span>
              <span class="block text-xs text-(--ui-text-muted)">{{ t('styles.satHDHint') }}</span>
            </span>
            <USwitch v-model="satHD" />
          </label>
          <label class="flex items-center gap-3 px-4 py-3">
            <UIcon name="i-lucide-tags" class="size-5 text-amber-500" />
            <span class="flex-1 text-sm">{{ t('styles.satLabels') }}</span>
            <USwitch v-model="satLabels" />
          </label>
          <label class="flex items-center gap-3 px-4 py-3">
            <UIcon name="i-lucide-mountain-snow" class="size-5 text-sky-500" />
            <span class="flex-1">
              <span class="block text-sm">{{ t('styles.satTerrain') }}</span>
              <span class="block text-xs text-(--ui-text-muted)">{{ t('styles.satTerrainHint') }}</span>
            </span>
            <USwitch v-model="satTerrain" />
          </label>
        </div>

        <div class="grid grid-cols-3 gap-2.5">
          <motion.button
            v-for="(s, i) in cards"
            :key="s.id"
            class="group relative text-left"
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ delay: i * 0.025 }"
            :while-press="{ scale: 0.95 }"
            @click="choose(s.id)"
          >
            <div class="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-black/5 transition-shadow" :class="styleChoice === s.id ? 'shadow-lg' : ''">
              <!-- Auto: half light, half dark -->
              <svg v-if="s.id === 'auto'" viewBox="0 0 120 90" class="size-full">
                <defs><clipPath id="half"><path d="M0 0H120L0 90Z" /></clipPath></defs>
                <g v-html="thumb(styleById('dark').swatch, false)" />
                <g clip-path="url(#half)" v-html="thumb(styleById('liberty').swatch, false)" />
              </svg>
              <svg v-else viewBox="0 0 120 90" class="size-full" v-html="thumb(s.swatch, !!s.extrude)" />
              <motion.div
                v-if="styleChoice === s.id"
                layout-id="style-ring"
                class="pointer-events-none absolute inset-0 rounded-2xl ring-[3px] ring-(--ui-primary) ring-inset"
                :transition="{ type: 'spring', stiffness: 500, damping: 38 }"
              />
              <span
                v-if="styleChoice === s.id"
                class="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-(--ui-primary) text-white shadow"
              >
                <UIcon name="i-lucide-check" class="size-3.5" />
              </span>
              <span v-if="s.tag" class="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide backdrop-blur" :class="s.dark ? 'bg-white/20 text-white' : 'bg-black/45 text-white'">
                {{ s.id === 'auto' ? t('styles.tagAuto') : styleTag(s.id, s.tag) }}
              </span>
            </div>
            <p class="mt-1.5 truncate px-0.5 text-[13px] font-medium" :class="styleChoice === s.id ? 'text-(--ui-primary)' : ''">{{ s.id === 'auto' ? t('styles.auto') : styleLabel(s.id, s.label) }}</p>
          </motion.button>
        </div>

        <!-- Live layers -->
        <h3 class="mt-5 mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--ui-text-dimmed)">{{ t('live.title') }}</h3>
        <div class="divide-y divide-(--ui-border) overflow-hidden rounded-2xl border border-(--ui-border)">
          <div class="px-4 py-3">
            <label class="flex items-center gap-3">
              <UIcon name="i-lucide-traffic-cone" class="size-5 text-orange-500" />
              <span class="flex-1">
                <span class="block text-sm">{{ t('live.traffic') }}</span>
                <span class="block text-xs text-(--ui-text-muted)">{{ keys.tomtom.value ? t('live.trafficHint') : t('live.needKey', { who: 'TomTom' }) }}</span>
              </span>
              <USwitch v-model="showTraffic" />
            </label>
            <div v-if="showTraffic && !keys.tomtom.value" class="mt-3 space-y-2">
              <KeyInput v-model="keys.tomtom.value" placeholder="TomTom API key" href="https://developer.tomtom.com/user/register" />
              <a :href="trafficInGoogle" target="_blank" rel="noopener" class="flex items-center justify-center gap-1.5 rounded-xl bg-(--ui-bg-elevated) py-2 text-xs font-semibold">
                <UIcon name="i-lucide-external-link" class="size-3.5" /> {{ t('live.openGoogleTraffic') }}
              </a>
            </div>
          </div>
          <div class="px-4 py-3">
            <label class="flex items-center gap-3">
              <UIcon name="i-lucide-person-standing" class="size-5 text-emerald-500" />
              <span class="flex-1">
                <span class="block text-sm">{{ t('live.street') }}</span>
                <span class="block text-xs text-(--ui-text-muted)">{{ keys.mapillary.value ? t('live.streetHint') : t('live.needKey', { who: 'Mapillary' }) }}</span>
              </span>
              <USwitch v-model="showStreet" />
            </label>
            <div v-if="showStreet && !keys.mapillary.value" class="mt-3">
              <KeyInput v-model="keys.mapillary.value" placeholder="MLY|… client token" href="https://www.mapillary.com/dashboard/developers" />
            </div>
          </div>
        </div>

        <div class="mt-5 divide-y divide-(--ui-border) overflow-hidden rounded-2xl border border-(--ui-border)">
          <label class="flex items-center gap-3 px-4 py-3">
            <UIcon name="i-lucide-square-dashed" class="size-5 text-violet-500" />
            <span class="flex-1 text-sm">{{ t('styles.boundaries') }}</span>
            <USwitch v-model="showBoundaries" />
          </label>
          <label class="flex items-center gap-3 px-4 py-3">
            <UIcon name="i-lucide-sparkles" class="size-5 text-emerald-500" />
            <span class="flex-1 text-sm">{{ t('styles.explored') }}</span>
            <USwitch v-model="showExplored" />
          </label>
        </div>

        <p v-if="current.extrude" class="mt-1 text-center text-[11px] text-(--ui-text-muted)">{{ t('styles.tip3d') }}</p>
      </div>
    </template>
  </UDrawer>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { MAP_STYLES, AUTO_STYLE, styleById, type Swatch } from '~/utils/mapStyles'
import { WHITE } from '~/utils/colors'
import { googleTrafficUrl } from '~/composables/useKeys'

const open = defineModel<boolean>('open', { default: false })
const { styleChoice, showBoundaries, showExplored, satLabels, satTerrain, satHD, satSource, showTraffic, showStreet, camera, mapApi } = useAppState()
const keys = useKeys()
const trafficInGoogle = computed(() => {
  const c = mapApi.value?.center() ?? { lat: 11.56, lng: 104.92 }
  return googleTrafficUrl(c.lat, c.lng, Math.max(camera.value.zoom, 12))
})
const colorMode = useColorMode()
const { t, styleLabel, styleTag } = useLang()

const cards = computed(() => [
  { id: AUTO_STYLE, label: 'Auto', tag: 'Light/Dark', dark: false, extrude: false, swatch: styleById('liberty').swatch },
  ...MAP_STYLES,
])
const current = computed(() => styleById(styleChoice.value === AUTO_STYLE ? (colorMode.value === 'dark' ? 'dark' : 'liberty') : styleChoice.value))

function choose(id: string) {
  styleChoice.value = id
  // Keep the app's panels in tune with the map: dark map, dark panels
  colorMode.preference = id === AUTO_STYLE ? 'system' : styleById(id).dark ? 'dark' : 'light'
  haptic('select')
}

/** Tiny illustrated map in the style's palette. */
function thumb(c: Swatch, extrude: boolean) {
  const blocks = extrude
    ? [[22, 52, 14, 18], [40, 58, 10, 26], [84, 18, 12, 22], [98, 30, 9, 14]].map(([x, y, w, h]) =>
        `<path d="M${x} ${y}l${w} -5v-${h}l-${w} 5Z" fill="${c.building}" opacity=".95"/><path d="M${x} ${y}v-${h}l-6 -3v${h}Z" fill="${c.building}" opacity=".7"/><path d="M${x} ${y - h}l${w} -5l-6 -3l-${w} 5Z" fill="${WHITE}" opacity=".45"/>`).join('')
    : [[18, 50, 12, 9], [34, 54, 9, 8], [86, 14, 11, 9], [100, 26, 10, 8], [70, 64, 10, 9]].map(([x, y, w, h]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${c.building}"/>`).join('')
  return `
    <rect width="120" height="90" fill="${c.land}"/>
    <path d="M-5 12C20 6 40 22 34 34S6 44 -5 40Z" fill="${c.park}"/>
    <path d="M78 58c10-8 30-6 44 0v40H70c-4-14 0-30 8-40Z" fill="${c.park}" opacity=".9"/>
    <path d="M-5 70C25 58 45 80 70 66S105 40 125 46" stroke="${c.water}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M0 30L120 22M54 -5L60 95M8 88L44 -5" stroke="${c.road}" stroke-width="2.6" fill="none"/>
    ${blocks}
    <path d="M-5 50C30 44 60 46 125 34" stroke="${c.roadMajor}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="66" cy="40" r="5.5" fill="#10b981" stroke="${WHITE}" stroke-width="2"/>
  `
}
</script>
