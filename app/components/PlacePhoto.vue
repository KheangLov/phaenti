<template>
  <div class="relative overflow-hidden bg-(--ui-bg-elevated)">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      referrerpolicy="no-referrer"
      loading="lazy"
      decoding="async"
      class="size-full object-cover transition-opacity duration-500"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="loaded = true"
      @error="failed = true"
    >
    <div v-if="!loaded || failed" class="absolute inset-0 grid place-items-center">
      <UIcon :name="failed ? 'i-lucide-image-off' : 'i-lucide-image'" class="size-6 text-(--ui-text-dimmed)" :class="failed ? '' : 'animate-pulse'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { photoSrc } from '~/utils/photos'

const props = defineProps<{ photo: string; alt?: string }>()
const src = ref<string | null>(null)
const loaded = ref(false)
const failed = ref(false)
watch(() => props.photo, async (r) => {
  loaded.value = false
  failed.value = false
  src.value = await photoSrc(r)
  if (!src.value) failed.value = true
}, { immediate: true })
</script>
