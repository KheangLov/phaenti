<template>
  <UDrawer v-model:open="open" title="Offline & storage" description="Everything here works without internet.">
    <template #body>
      <div class="space-y-4 pb-safe">
        <!-- Status -->
        <div class="flex items-center gap-3 rounded-2xl p-4" :class="online ? 'bg-emerald-500/10' : 'bg-amber-500/10'">
          <UIcon :name="online ? 'i-lucide-cloud-check' : 'i-lucide-cloud-off'" class="size-7" :class="online ? 'text-emerald-500' : 'text-amber-500'" />
          <div>
            <p class="font-semibold">{{ online ? 'Online' : 'You’re offline' }}</p>
            <p class="text-sm text-(--ui-text-muted)">{{ online ? 'Saving map areas uses data — Wi-Fi is best.' : 'Showing saved data. Search for new places needs internet.' }}</p>
          </div>
        </div>

        <!-- What works offline -->
        <ul class="divide-y divide-(--ui-border) overflow-hidden rounded-2xl border border-(--ui-border)">
          <li v-for="r in rows" :key="r.label" class="flex items-center gap-3 px-4 py-3">
            <UIcon
              :name="r.state === 'ok' ? 'i-lucide-check-circle-2' : r.state === 'busy' ? 'i-lucide-loader-circle' : 'i-lucide-circle-dashed'"
              class="size-5 shrink-0"
              :class="r.state === 'ok' ? 'text-emerald-500' : r.state === 'busy' ? 'animate-spin text-(--ui-text-dimmed)' : 'text-(--ui-text-dimmed)'"
            />
            <span class="flex-1 text-sm">{{ r.label }}</span>
            <span class="text-xs text-(--ui-text-muted)">{{ r.meta }}</span>
          </li>
        </ul>

        <!-- Save map areas -->
        <div>
          <h3 class="mb-2 text-sm font-semibold">Save the map for offline</h3>

          <div v-if="job" class="rounded-2xl bg-(--ui-bg-elevated) p-4">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Saving {{ job.label }}…</span>
              <span class="tabular-nums text-(--ui-text-muted)">{{ Math.round((job.done / job.total) * 100) }}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-(--ui-border)">
              <div class="h-full rounded-full bg-(--ui-primary) transition-[width] duration-200" :style="{ width: `${(job.done / job.total) * 100}%` }" />
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-(--ui-text-muted)">
              <span>{{ job.done }} / {{ job.total }} files · {{ formatBytes(job.bytes) }}</span>
              <button class="font-medium text-(--ui-error)" @click="cancel">Cancel</button>
            </div>
          </div>

          <div v-else class="grid gap-2">
            <button
              v-for="opt in options"
              :key="opt.key"
              class="flex items-center gap-3 rounded-2xl bg-(--ui-bg-elevated) p-3.5 text-left transition active:scale-[0.98] disabled:opacity-50"
              :disabled="!online || !opt.plan"
              @click="save(opt)"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-xl text-white" :style="{ background: opt.bg }">
                <UIcon :name="opt.icon" class="size-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-medium">{{ opt.title }}</span>
                <span class="block text-xs text-(--ui-text-muted)">{{ opt.plan ? `${opt.plan.urls.length} files · zoom ${opt.plan.minzoom}–${opt.plan.maxzoom}` : 'Open the map first' }}</span>
              </span>
              <UIcon name="i-lucide-download" class="size-5 text-(--ui-text-dimmed)" />
            </button>
          </div>
        </div>

        <!-- Storage -->
        <div class="rounded-2xl border border-(--ui-border) p-4">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium">Storage used</span>
            <span class="text-(--ui-text-muted)">{{ usage ? `${formatBytes(usage.used)} of ${formatBytes(usage.quota)}` : '—' }}</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-(--ui-border)">
            <div class="h-full rounded-full bg-violet-500" :style="{ width: `${usage && usage.quota ? Math.max(1, (usage.used / usage.quota) * 100) : 0}%` }" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-xs" :class="persisted ? 'text-emerald-600 dark:text-emerald-400' : 'text-(--ui-text-muted)'">
              <UIcon :name="persisted ? 'i-lucide-shield-check' : 'i-lucide-shield'" class="size-4" />
              {{ persisted ? 'Protected from automatic clean-up' : 'Browser may clear data when space is low' }}
            </span>
            <UButton v-if="!persisted" size="xs" variant="soft" @click="protect">Protect</UButton>
          </div>
          <UButton v-if="savedTiles" block size="sm" color="neutral" variant="ghost" icon="i-lucide-trash-2" class="mt-3" @click="clear">
            Remove saved map areas
          </UButton>
        </div>
      </div>
    </template>
  </UDrawer>
</template>

<script setup lang="ts">
import { planArea, formatBytes, CAMBODIA_BBOX, type AreaPlan } from '~/composables/useOffline'

const open = defineModel<boolean>('open', { default: false })
const { online, swReady, persisted, usage, savedTiles, job, refreshStats, download, clearTiles, requestPersist, cancel } = useOffline()
const { places } = usePlaces()
const { mapApi } = useAppState()
const admin = useAdmin()
const toast = useToast()

const info = ref(mapApi.value?.offlineInfo() ?? null)
watch(open, (v) => {
  if (!v) return
  info.value = mapApi.value?.offlineInfo() ?? null
  refreshStats()
})

const rows = computed(() => [
  { label: 'App', state: swReady.value ? 'ok' : 'busy', meta: swReady.value ? 'Ready offline' : 'Preparing…' },
  { label: 'Your places', state: 'ok', meta: `${places.value.length} on this device` },
  { label: 'Cambodia boundaries & village search', state: swReady.value && admin.ready.value ? 'ok' : 'busy', meta: '25 · 197 · 1,633 · 14,578' },
  { label: 'Map areas you’ve viewed or saved', state: savedTiles.value ? 'ok' : 'none', meta: savedTiles.value ? `${savedTiles.value} files` : 'None yet' },
])

interface Opt { key: string; title: string; icon: string; bg: string; plan: AreaPlan | null }
const options = computed<Opt[]>(() => {
  const i = info.value
  if (!i) return [
    { key: 'view', title: 'This area', icon: 'i-lucide-scan', bg: '#7c3aed', plan: null },
    { key: 'kh', title: 'Cambodia overview', icon: 'i-lucide-map', bg: '#10b981', plan: null },
  ]
  const z = Math.floor(i.zoom)
  return [
    { key: 'view', title: 'This area in detail', icon: 'i-lucide-scan', bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)', plan: planArea(i, i.bounds, Math.max(0, z - 2), Math.min(15, z + 3), 'this area') },
    { key: 'kh', title: 'Cambodia overview (roads & towns)', icon: 'i-lucide-map', bg: 'linear-gradient(135deg,#10b981,#0d9488)', plan: planArea(i, CAMBODIA_BBOX, 5, 10, 'Cambodia') },
  ]
})

async function save(o: Opt) {
  if (!o.plan) return
  await requestPersist()
  const r = await download(o.plan)
  if (!r) return
  if (r.cancelled) toast.add({ title: 'Download stopped', description: `${r.done} files saved`, icon: 'i-lucide-circle-stop' })
  else toast.add({ title: `Saved ${o.plan.label} for offline`, description: `${formatBytes(r.bytes)} downloaded${r.failed ? `, ${r.failed} failed` : ''}`, icon: 'i-lucide-cloud-download', color: 'primary' })
}

async function clear() {
  await clearTiles()
  toast.add({ title: 'Saved map areas removed', icon: 'i-lucide-trash-2' })
}

async function protect() {
  const ok = await requestPersist()
  if (!ok) toast.add({ title: 'Install the app to protect your data', description: 'Browsers grant this to installed apps.', icon: 'i-lucide-shield', color: 'warning' })
}
</script>
