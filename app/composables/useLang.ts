// Tiny i18n: English and Khmer, no runtime dependency.
import { en, km, CATEGORY_KM, QUICK_KM, STYLE_KM } from '~/i18n/messages'

export type Lang = 'en' | 'km'
const KEY = 'phaenti:lang'

function initial(): Lang {
  if (!import.meta.client) return 'en'
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'km') return saved
  } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('km') ? 'km' : 'en'
}

const lang = ref<Lang>(initial())
const dicts = { en, km } as const

if (import.meta.client) {
  const apply = (l: Lang) => {
    document.documentElement.lang = l
    document.documentElement.classList.toggle('lang-km', l === 'km')
  }
  apply(lang.value)
  watch(lang, (l) => {
    apply(l)
    try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  })
}

function lookup(d: unknown, path: string): string | undefined {
  let cur: any = d
  for (const k of path.split('.')) cur = cur?.[k]
  return typeof cur === 'string' ? cur : undefined
}

/** tr("area.explored", { what: "Districts" }) */
function tr(path: string, params?: Record<string, string | number>) {
  let s = lookup(dicts[lang.value], path) ?? lookup(en, path) ?? path
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export function useLang() {
  const isKm = computed(() => lang.value === 'km')
  return {
    lang,
    isKm,
    t: tr,
    setLang: (l: Lang) => (lang.value = l),
    /** Pick the Khmer or Latin form of a name */
    pick: (latin: string, khmer?: string | null) => (lang.value === 'km' && khmer ? khmer : latin),
    catLabel: (id: string, fallback: string) => (lang.value === 'km' ? CATEGORY_KM[id] ?? fallback : fallback),
    quickLabel: (id: string, fallback: string) => (lang.value === 'km' ? QUICK_KM[id] ?? fallback : fallback),
    styleLabel: (id: string, fallback: string) => (lang.value === 'km' ? STYLE_KM[id]?.label ?? fallback : fallback),
    styleTag: (id: string, fallback: string) => (lang.value === 'km' ? STYLE_KM[id]?.tag ?? fallback : fallback),
    locale: computed(() => (lang.value === 'km' ? 'km-KH' : 'en-GB')),
  }
}
