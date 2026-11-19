<template>
  <UDrawer v-model:open="open" :title="t('offline.title')" :description="t('offline.desc')">
    <template #body>
      <div class="space-y-4 pb-safe">
        <!-- Status -->
        <div class="flex items-center gap-3 rounded-2xl p-4" :class="online ? 'bg-emerald-500/10' : 'bg-amber-500/10'">
          <UIcon :name="online ? 'i-lucide-cloud-check' : 'i-lucide-cloud-off'" class="size-7" :class="online ? 'text-emerald-500' : 'text-amber-500'" />
          <div>
            <p class="font-semibold">{{ online ? t('offline.online') : t('offline.offline') }}</p>
            <p class="text-sm text-(--ui-text-muted)">{{ online ? t('offline.onlineHint') : t('offline.offlineHint') }}</p>
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
          <h3 class="mb-2 text-sm font-semibold">{{ t('offline.saveTitle') }}</h3>

          <div v-if="job" class="rounded-2xl bg-(--ui-bg-elevated) p-4">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">{{ t('offline.saving', { what: job.label }) }}</span>
              <span class="tabular-nums text-(--ui-text-muted)">{{ Math.round((job.done / job.total) * 100) }}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-(--ui-border)">
              <div class="h-full rounded-full bg-(--ui-primary) transition-[width] duration-200" :style="{ width: `${(job.done / job.total) * 100}%` }" />
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-(--ui-text-muted)">
              <span>{{ t('offline.filesProgress', { done: job.done, total: job.total, size: formatBytes(job.bytes) }) }}</span>
              <button class="font-medium text-(--ui-error)" @click="cancel">{{ t('app.cancel') }}</button>
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
                <span class="block text-xs text-(--ui-text-muted)">{{ opt.plan ? t('offline.planMeta', { n: opt.plan.urls.length, a: opt.plan.minzoom, b: opt.plan.maxzoom }) : t('offline.openMapFirst') }}</span>
              </span>
              <UIcon name="i-lucide-download" class="size-5 text-(--ui-text-dimmed)" />
            </button>
          </div>
        </div>

        <!-- Storage -->
        <div class="rounded-2xl border border-(--ui-border) p-4">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium">{{ t('offline.storage') }}</span>
            <span class="text-(--ui-text-muted)">{{ usage ? t('offline.storageOf', { used: formatBytes(usage.used), quota: formatBytes(usage.quota) }) : '—' }}</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-(--ui-border)">
            <div class="h-full rounded-full bg-violet-500" :style="{ width: `${usage && usage.quota ? Math.max(1, (usage.used / usage.quota) * 100) : 0}%` }" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-xs" :class="persisted ? 'text-emerald-600 dark:text-emerald-400' : 'text-(--ui-text-muted)'">
              <UIcon :name="persisted ? 'i-lucide-shield-check' : 'i-lucide-shield'" class="size-4" />
              {{ persisted ? t('offline.protected') : t('offline.unprotected') }}
            </span>
            <UButton v-if="!persisted" size="xs" variant="soft" @click="protect">{{ t('offline.protect') }}</UButton>
          </div>
          <UButton v-if="savedTiles" block size="sm" color="neutral" variant="ghost" icon="i-lucide-trash-2" class="mt-3" @click="clear">
            {{ t('offline.remove') }}
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
const { t } = useLang()

const info = ref(mapApi.value?.offlineInfo() ?? null)
watch(open, (v) => {
  if (!v) return
  info.value = mapApi.value?.offlineInfo() ?? null
  refreshStats()
})

const rows = computed(() => [
  { label: t('offline.app'), state: swReady.value ? 'ok' : 'busy', meta: swReady.value ? t('offline.ready') : t('offline.preparing') },
  { label: t('offline.yourPlaces'), state: 'ok', meta: t('offline.onDevice', { n: places.value.length }) },
  { label: t('offline.admin'), state: swReady.value && admin.ready.value ? 'ok' : 'busy', meta: '25 · 197 · 1,633 · 14,578' },
  { label: t('offline.tiles'), state: savedTiles.value ? 'ok' : 'none', meta: savedTiles.value ? t('offline.files', { n: savedTiles.value }) : t('offline.none') },
])

interface Opt { key: string; title: string; icon: string; bg: string; plan: AreaPlan | null }
const options = computed<Opt[]>(() => {
  const i = info.value
  if (!i) return [
    { key: 'view', title: t('offline.thisArea'), icon: 'i-lucide-scan', bg: '#7c3aed', plan: null },
    { key: 'kh', title: t('offline.overview'), icon: 'i-lucide-map', bg: '#10b981', plan: null },
  ]
  const z = Math.floor(i.zoom)
  return [
    { key: 'view', title: t('offline.thisArea'), icon: 'i-lucide-scan', bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)', plan: planArea(i, i.bounds, Math.max(0, z - 2), Math.min(15, z + 3), t('offline.labelArea')) },
    { key: 'kh', title: t('offline.overview'), icon: 'i-lucide-map', bg: 'linear-gradient(135deg,#10b981,#0d9488)', plan: planArea(i, CAMBODIA_BBOX, 5, 10, t('offline.labelCambodia')) },
  ]
})

async function save(o: Opt) {
  if (!o.plan) return
  await requestPersist()
  const r = await download(o.plan)
  if (!r) return
  if (r.cancelled) toast.add({ title: t('offline.stopped'), description: t('offline.savedFiles', { n: r.done }), icon: 'i-lucide-circle-stop' })
  else toast.add({ title: t('offline.savedFor', { what: o.plan.label }), description: t('offline.downloaded', { size: formatBytes(r.bytes) }) + (r.failed ? t('offline.failed', { n: r.failed }) : ''), icon: 'i-lucide-cloud-download', color: 'primary' })
}

async function clear() {
  await clearTiles()
  toast.add({ title: t('offline.removed'), icon: 'i-lucide-trash-2' })
}

async function protect() {
  const ok = await requestPersist()
  if (!ok) toast.add({ title: t('offline.protectHint'), description: t('offline.protectHint2'), icon: 'i-lucide-shield', color: 'warning' })
}
</script>
