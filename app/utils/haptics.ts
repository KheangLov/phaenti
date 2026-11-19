// Small vibration cues on Android (iPhone browsers ignore navigator.vibrate).
const PATTERNS = { select: 6, tap: 10, snap: 8, success: [10, 40, 12], warn: [20, 60, 20] } as const
export function haptic(kind: keyof typeof PATTERNS = 'tap') {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(PATTERNS[kind] as number | number[])
  } catch { /* unsupported */ }
}
