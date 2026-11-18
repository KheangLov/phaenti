<template>
  <div class="px-5 pt-1 pb-6">
    <div class="flex items-start gap-3">
      <motion.img
        :key="`${place.category}-${place.status}`"
        :src="pinDataUrl(place.category, place.status)"
        alt=""
        class="-mt-1 h-13 w-11 shrink-0"
        :initial="{ y: -12, scale: 0.7, opacity: 0 }"
        :animate="{ y: 0, scale: 1, opacity: 1 }"
        :transition="{ type: 'spring', stiffness: 520, damping: 18 }"
      />
      <div class="min-w-0 flex-1">
        <input
          :value="place.name"
          class="w-full bg-transparent text-xl font-semibold tracking-tight outline-none"
          aria-label="Place name"
          @change="save({ name: ($event.target as HTMLInputElement).value.trim() || place.name })"
        >
        <p class="mt-0.5 truncate text-sm text-(--ui-text-muted)">{{ place.address || formatCoords(place.lat, place.lng) }}</p>
        <div v-if="areas.length" class="mt-1.5 flex flex-wrap gap-1">
          <button
            v-for="a in areas"
            :key="a.code"
            class="inline-flex items-center gap-1 rounded-full bg-(--ui-bg-elevated) px-2 py-0.5 text-[11px] font-medium text-(--ui-text-muted) active:scale-95 transition"
            @click="goArea(a.code)"
          >
            {{ a.name }}
            <UIcon name="i-lucide-chevron-right" class="size-3" />
          </button>
        </div>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="soft" class="rounded-full" aria-label="Close" @click="select(null)" />
    </div>

    <div class="mt-4">
      <StatusToggle :model-value="place.status" @update:model-value="setStatus" />
    </div>
    <div class="mt-3">
      <CategoryPicker :model-value="place.category" @update:model-value="setCategory" />
    </div>

    <!-- Quick actions -->
    <div class="mt-4 grid grid-cols-3 gap-2">
      <a
        :href="googleMapsUrl(place.lat, place.lng)"
        target="_blank"
        rel="noopener"
        class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition"
      >
        <UIcon name="i-lucide-navigation" class="size-5 text-sky-500" />
        Directions
      </a>
      <button class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition" @click="share">
        <UIcon name="i-lucide-share" class="size-5 text-(--ui-primary)" />
        Share
      </button>
      <button class="flex flex-col items-center gap-1 rounded-2xl bg-(--ui-bg-elevated) py-3 text-xs font-medium active:scale-95 transition" @click="mapApi?.flyTo(place.lng, place.lat, 16)">
        <UIcon name="i-lucide-focus" class="size-5 text-amber-500" />
        Zoom to
      </button>
    </div>

    <!-- Details -->
    <div class="mt-5 space-y-4">
      <div v-if="place.status === 'been'" class="flex items-center justify-between gap-3">
        <label for="visited" class="text-sm font-medium text-(--ui-text-muted)">Visited on</label>
        <input
          id="visited"
          type="date"
          :value="place.visitedAt ?? ''"
          :max="today"
          class="rounded-xl bg-(--ui-bg-elevated) px-3 py-2 text-sm outline-none"
          @change="save({ visitedAt: ($event.target as HTMLInputElement).value || null })"
        >
      </div>

      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-(--ui-text-muted)">{{ place.status === 'been' ? 'Your rating' : 'How excited?' }}</span>
        <div class="flex gap-0.5" role="radiogroup" aria-label="Rating">
          <motion.button
            v-for="n in 5"
            :key="n"
            role="radio"
            :aria-checked="place.rating === n"
            :aria-label="`${n} star${n > 1 ? 's' : ''}`"
            class="grid size-9 place-items-center"
            :while-press="{ scale: 0.8 }"
            @click="save({ rating: place.rating === n ? 0 : n })"
          >
            <motion.span
              :animate="{ scale: n <= place.rating ? 1 : 0.86 }"
              :transition="{ type: 'spring', stiffness: 600, damping: 18, delay: (n - 1) * 0.03 }"
            >
              <UIcon
                name="i-lucide-star"
                class="size-6 transition-colors"
                :class="n <= place.rating ? 'text-amber-400 [&>path]:fill-current' : 'text-(--ui-text-dimmed)/50'"
              />
            </motion.span>
          </motion.button>
        </div>
      </div>

      <div>
        <label for="notes" class="mb-1.5 block text-sm font-medium text-(--ui-text-muted)">Notes</label>
        <textarea
          id="notes"
          v-model="notes"
          rows="3"
          placeholder="What made it special? What to order? Who recommended it?"
          class="w-full resize-none rounded-2xl bg-(--ui-bg-elevated) px-3.5 py-3 text-[15px] outline-none placeholder:text-(--ui-text-dimmed) field-sizing-content min-h-24"
        />
      </div>

      <div class="flex items-center justify-between pt-2 text-xs text-(--ui-text-dimmed)">
        <span>{{ formatCoords(place.lat, place.lng) }}</span>
        <span>Added {{ added }}</span>
      </div>

      <UButton
        block
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        class="rounded-2xl h-11"
        @click="del"
      >
        Delete place
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { watchDebounced } from '@vueuse/core'
import { STATUS_COLORS, type Place, type PlaceStatus } from '~/utils/db'
import { categoryOf, type CategoryId } from '~/utils/categories'
import { pinDataUrl } from '~/utils/pins'
import { placeAdmin } from '~/composables/useAdmin'

const props = defineProps<{ place: Place }>()
const { update, remove, restore } = usePlaces()
const { select, openArea, mapApi: mapApiRef } = useAppState()
const admin = useAdmin()

const areas = computed(() => {
  const a = placeAdmin.value.get(props.place.id)
  if (!a) return []
  return [a.c, a.d, a.p].map(c => admin.area(c)).filter((x): x is NonNullable<typeof x> => !!x)
})
function goArea(code: string) {
  openArea({ code })
  const a = admin.area(code)
  if (a?.bbox) mapApiRef.value?.fitBounds(a.bbox)
}
function setCategory(category: CategoryId) {
  if (category === props.place.category) return
  save({ category })
  mapApiRef.value?.pulse(props.place.lng, props.place.lat, categoryOf(category).color)
}
const mapApi = computed(() => mapApiRef.value)
const toast = useToast()

const today = new Date().toISOString().slice(0, 10)
const added = computed(() => new Date(props.place.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))

function save(patch: Partial<Place>) {
  return update(props.place.id, patch)
}

function setStatus(status: PlaceStatus) {
  if (status === props.place.status) return
  save({ status, visitedAt: status === 'been' ? (props.place.visitedAt ?? today) : props.place.visitedAt })
  mapApi.value?.pulse(props.place.lng, props.place.lat, STATUS_COLORS[status])
}

// Notes autosave
const notes = ref(props.place.notes)
watch(() => props.place.id, () => (notes.value = props.place.notes))
watchDebounced(notes, (v) => {
  if (v !== props.place.notes) save({ notes: v })
}, { debounce: 500 })

async function share() {
  const p = props.place
  const url = googleMapsUrl(p.lat, p.lng)
  const text = `${p.name}${p.notes ? ` — ${p.notes}` : ''}`
  try {
    if (navigator.share) await navigator.share({ title: p.name, text, url })
    else {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      toast.add({ title: 'Link copied', icon: 'i-lucide-copy', duration: 1800 })
    }
  } catch { /* user cancelled */ }
}

async function del() {
  const old = await remove(props.place.id)
  select(null)
  if (!old) return
  toast.add({
    title: `Deleted “${old.name}”`,
    icon: 'i-lucide-trash-2',
    duration: 5000,
    actions: [{ label: 'Undo', color: 'neutral', variant: 'outline', onClick: () => restore(old) }],
  })
}
</script>
