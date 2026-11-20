<template>
  <div class="px-5 pt-1 pb-4">
    <div class="flex items-start gap-3">
      <motion.img
        :key="`${category}`"
        :src="pinDataUrl(category, personal ? 'been' : 'planned')"
        alt=""
        class="-mt-1 h-13 w-11 shrink-0"
        :initial="{ y: -14, opacity: 0, scale: 0.7 }"
        :animate="{ y: 0, opacity: 1, scale: 1 }"
        :transition="{ type: 'spring', stiffness: 520, damping: 20 }"
      />
      <div class="min-w-0 flex-1">
        <input
          v-model="name"
          class="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-(--ui-text-dimmed)"
          :class="draft.loading ? 'animate-pulse' : ''"
          :placeholder="t('place.namePlaceholder')"
          :aria-label="t('place.namePlaceholder')"
        >
        <p class="mt-0.5 truncate text-sm text-(--ui-text-muted)">{{ draft.address }}</p>
        <p v-if="where" class="mt-0.5 flex items-center gap-1 truncate text-xs text-(--ui-text-dimmed)">
          <UIcon name="i-lucide-map" class="size-3.5 shrink-0" />{{ where }}
        </p>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="soft" class="rounded-full" :aria-label="t('place.discard')" @click="closeAll" />
    </div>

    <!-- Personal place: home, office, family, friend -->
    <template v-if="personal">
      <div class="mt-4">
        <PersonalPicker v-model="category" />
      </div>
      <input
        v-model="person"
        class="mt-3 h-12 w-full rounded-2xl bg-(--ui-bg-elevated) px-4 text-base outline-none placeholder:text-(--ui-text-dimmed)"
        :placeholder="personPlaceholder"
        :aria-label="personPlaceholder"
        enterkeyhint="done"
      >
      <motion.button
        class="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
        :style="{ background: `linear-gradient(135deg, ${cat.color}, ${cat.color2})`, boxShadow: `0 10px 22px -10px ${cat.color}` }"
        :while-press="{ scale: 0.97 }"
        @click="save('been')"
      >
        <UIcon :name="`i-lucide-${cat.icon}`" class="size-5" />
        {{ t('personal.saveAs', { label: catLabel(cat.id, cat.label) }) }}
      </motion.button>
      <button class="mx-auto mt-3 block text-xs font-medium text-(--ui-text-muted)" @click="category = 'other'">
        {{ t('personal.notPersonal') }}
      </button>
    </template>

    <template v-else>
    <div class="mt-4">
      <CategoryPicker v-model="category" />
    </div>

    <div class="mt-4 grid grid-cols-2 gap-3">
      <motion.button
        v-for="(s, i) in actions"
        :key="s.status"
        class="flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
        :style="{ background: STATUS_COLORS[s.status], boxShadow: `0 10px 22px -10px ${STATUS_COLORS[s.status]}` }"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 380, damping: 28 }"
        :while-press="{ scale: 0.95 }"
        @click="save(s.status)"
      >
        <UIcon :name="s.icon" class="size-5" />
        {{ t(s.key) }}
      </motion.button>
    </div>

    <!-- Or save as one of your own places -->
    <div class="mt-4 flex items-center gap-2">
      <span class="shrink-0 text-xs font-medium text-(--ui-text-dimmed)">{{ t('personal.orSaveAs') }}</span>
      <div class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
        <button
          v-for="c in PERSONAL"
          :key="c.id"
          class="flex h-8 shrink-0 items-center gap-1 rounded-full bg-(--ui-bg-elevated) px-2.5 text-xs font-semibold active:scale-95 transition"
          @click="category = c.id; haptic('select')"
        >
          <UIcon :name="`i-lucide-${c.icon}`" class="size-3.5" :style="{ color: c.color }" />
          {{ catLabel(c.id, c.label) }}
        </button>
      </div>
    </div>
    </template>

    <div class="mt-4 flex items-center justify-between text-xs text-(--ui-text-dimmed)">
      <span>{{ formatCoords(draft.lat, draft.lng) }}</span>
      <span class="flex items-center gap-1.5">
      <button class="inline-flex items-center gap-1 rounded-full bg-(--ui-bg-elevated) px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400" @click="street.openAt(draft.lat, draft.lng)">
        <UIcon :name="street.busy.value ? 'i-lucide-loader-circle' : 'i-lucide-person-standing'" class="size-3.5" :class="street.busy.value ? 'animate-spin' : ''" /> {{ t('street.short') }}
      </button>
      <button class="inline-flex items-center gap-1 rounded-full bg-(--ui-bg-elevated) px-2.5 py-1 font-semibold text-sky-600 dark:text-sky-400" @click="openRoute({ lat: draft.lat, lng: draft.lng, name: name || draft.name, kind: 'place' })">
        <UIcon name="i-lucide-route" class="size-3.5" /> {{ t('place.route') }}
      </button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { STATUS_COLORS, type PlaceStatus } from '~/utils/db'
import { categoryOf, isPersonal, PERSONAL, type CategoryId } from '~/utils/categories'
import { pinDataUrl } from '~/utils/pins'
import type { Draft } from '~/composables/useAppState'

const props = defineProps<{ draft: Draft }>()
const { add } = usePlaces()
const { closeAll, select, mapApi, openRoute, draft: draftRef } = useAppState()
const street = useStreet()
const admin = useAdmin()
const toast = useToast()
const { t, pick, catLabel } = useLang()
const person = ref('')
const personal = computed(() => isPersonal(category.value))
const cat = computed(() => categoryOf(category.value))
const personPlaceholder = computed(() => t(`personal.who${category.value.charAt(0).toUpperCase()}${category.value.slice(1)}`))

const name = ref(props.draft.name)
const category = ref<CategoryId>(props.draft.category ?? 'other')
watch(() => props.draft.name, v => (name.value = v))
watch(() => props.draft.category, (v) => {
  if (v && category.value === 'other') category.value = v
})

watch(category, (v) => {
  if (draftRef.value && draftRef.value.category !== v) draftRef.value = { ...draftRef.value, category: v }
})

const where = computed(() => {
  const a = admin.lookupReady.value ? admin.locate(props.draft.lat, props.draft.lng) : null
  if (!a) return ''
  return [admin.area(a.c), admin.area(a.d), admin.area(a.p)].filter(Boolean).map(x => pick(x!.name, x!.km)).join(' · ')
})

const actions = [
  { status: 'been' as const, key: 'status.been', icon: 'i-lucide-check-circle-2' },
  { status: 'planned' as const, key: 'status.planned', icon: 'i-lucide-heart' },
]

async function save(status: PlaceStatus) {
  const d = props.draft
  const label = catLabel(cat.value.id, cat.value.label)
  // A personal place with no name of its own gets e.g. "Home" or "Grandma's home"
  const fallbackName = personal.value ? (person.value.trim() || label) : t('place.untitled')
  const nameTouched = name.value && name.value !== t('place.droppedPin')
  const p = await add({
    name: personal.value && !nameTouched ? fallbackName : (name.value || fallbackName),
    address: d.address, lat: d.lat, lng: d.lng, status, category: category.value, source: d.source,
    person: personal.value ? person.value : undefined,
  })
  mapApi.value?.pulse(p.lng, p.lat, categoryOf(p.category).color)
  haptic('success')
  select(p.id)
  toast.add({
    title: personal.value ? t('personal.saved', { label }) : status === 'been' ? t('toast.addedBeen') : t('toast.addedPlanned'),
    icon: personal.value ? `i-lucide-${cat.value.icon}` : 'i-lucide-map-pin-check',
    color: personal.value || status === 'been' ? 'primary' : 'secondary',
    duration: 2200,
  })
}
</script>
