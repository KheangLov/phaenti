<template>
  <div>
    <div class="flex gap-2">
      <input
        v-model="draft"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="placeholder"
        class="h-10 min-w-0 flex-1 rounded-xl bg-(--ui-bg-elevated) px-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-(--ui-text-dimmed)"
        @keydown.enter.prevent="save"
      >
      <UButton size="md" class="rounded-xl" :disabled="!draft.trim()" @click="save">{{ t('live.saveKey') }}</UButton>
    </div>
    <a :href="href" target="_blank" rel="noopener" class="mt-1.5 inline-flex items-center gap-1 px-1 text-xs font-medium text-(--ui-primary)">
      <UIcon name="i-lucide-key-round" class="size-3.5" /> {{ t('live.getKey') }}
    </a>
  </div>
</template>

<script setup lang="ts">
const model = defineModel<string>({ default: '' })
defineProps<{ placeholder: string; href: string }>()
const { t } = useLang()
const draft = ref('')
function save() {
  model.value = draft.value.trim()
  haptic('success')
}
</script>
