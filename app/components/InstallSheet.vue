<template>
  <UDrawer v-model:open="open" :title="installed ? 'Phaenti is installed' : 'Install Phaenti'" :description="installed ? 'You’re using the app version.' : 'Get the full app: home-screen icon, full screen, works offline.'">
    <template #body>
      <div class="pb-safe">
        <!-- Already installed -->
        <div v-if="installed" class="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4">
          <UIcon name="i-lucide-check-circle-2" class="size-7 text-emerald-500" />
          <p class="text-sm">Your places stay on this phone and the app works without internet.</p>
        </div>

        <template v-else>
          <!-- Benefits -->
          <ul class="mb-5 grid grid-cols-3 gap-2 text-center">
            <li v-for="b in benefits" :key="b.label" class="rounded-2xl bg-(--ui-bg-elevated) px-2 py-3">
              <UIcon :name="b.icon" class="mx-auto size-6" :class="b.color" />
              <p class="mt-1.5 text-xs font-medium leading-tight">{{ b.label }}</p>
            </li>
          </ul>

          <!-- One-tap install (Android / desktop Chrome, Edge) -->
          <UButton v-if="canPrompt" block size="xl" icon="i-lucide-download" class="h-13 rounded-2xl" @click="install">
            Install app
          </UButton>

          <!-- iPhone / iPad: manual steps -->
          <ol v-else-if="os === 'ios'" class="space-y-3">
            <li v-for="(s, i) in iosSteps" :key="i" class="flex items-center gap-3">
              <span class="grid size-8 shrink-0 place-items-center rounded-full bg-(--ui-primary) text-sm font-bold text-white">{{ i + 1 }}</span>
              <span class="flex-1 text-[15px]">
                {{ s.text }}
                <span v-if="s.icon" class="mx-1 inline-grid size-7 place-items-center rounded-lg bg-(--ui-bg-elevated) align-middle">
                  <UIcon :name="s.icon" class="size-4.5 text-sky-500" />
                </span>
                <b v-if="s.bold">{{ s.bold }}</b>
              </span>
            </li>
            <li class="pt-1 text-xs text-(--ui-text-muted)">
              On iPhone, installing also keeps Safari from clearing your saved places.
            </li>
          </ol>

          <!-- Android without the prompt, other browsers -->
          <ol v-else class="space-y-3 text-[15px]">
            <li class="flex items-center gap-3">
              <span class="grid size-8 shrink-0 place-items-center rounded-full bg-(--ui-primary) text-sm font-bold text-white">1</span>
              Open the browser menu <UIcon name="i-lucide-ellipsis-vertical" class="size-5" />
            </li>
            <li class="flex items-center gap-3">
              <span class="grid size-8 shrink-0 place-items-center rounded-full bg-(--ui-primary) text-sm font-bold text-white">2</span>
              Tap <b>Install app</b> or <b>Add to Home screen</b>
            </li>
          </ol>
        </template>
      </div>
    </template>
  </UDrawer>
</template>

<script setup lang="ts">
import { isStandalone, platform } from '~/composables/useOffline'

const open = defineModel<boolean>('open', { default: false })
const { $pwa } = useNuxtApp()
const os = platform()
const installed = computed(() => isStandalone() || !!$pwa?.isPWAInstalled)
const canPrompt = computed(() => !!$pwa?.showInstallPrompt)

const benefits = [
  { icon: 'i-lucide-smartphone', label: 'Home-screen app', color: 'text-violet-500' },
  { icon: 'i-lucide-wifi-off', label: 'Works offline', color: 'text-emerald-500' },
  { icon: 'i-lucide-shield-check', label: 'Data stays safe', color: 'text-sky-500' },
]
const iosSteps = [
  { text: 'Tap', icon: 'i-lucide-share', bold: 'Share' },
  { text: 'Scroll and tap', icon: 'i-lucide-square-plus', bold: 'Add to Home Screen' },
  { text: 'Tap', icon: '', bold: 'Add' },
]

async function install() {
  await $pwa?.install()
  open.value = false
}
</script>
