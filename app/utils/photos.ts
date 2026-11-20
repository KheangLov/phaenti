// Place photos: either a web link or a picture kept on this device (IndexedDB).
// Local photos are shrunk before saving so a few hundred of them stay small.
import { db, type PhotoBlob } from './db'

export const LOCAL = 'local:'
const MAX_SIDE = 1600
const QUALITY = 0.82

export const isLocalPhoto = (ref: string) => ref.startsWith(LOCAL)
export const localId = (ref: string) => ref.slice(LOCAL.length)

/** Only plain web links are allowed (no data:, javascript:, file:, …) */
export function cleanPhotoLink(raw: string): string | null {
  const s = raw.trim()
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.href
  } catch {
    return null
  }
}

/** Resolves when the link really is an image the browser can show */
export function checkImageLink(url: string, timeout = 12000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => done(false), timeout)
    function done(ok: boolean) {
      clearTimeout(timer)
      img.onload = img.onerror = null
      resolve(ok)
    }
    img.onload = () => done(img.naturalWidth > 0)
    img.onerror = () => done(false)
    img.referrerPolicy = 'no-referrer'
    img.src = url
  })
}

async function shrink(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', QUALITY))
    ?? await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('encode')
  // Never store something bigger than the original
  return blob.size < file.size || scale < 1 ? { blob, w, h } : { blob: file, w, h }
}

/** Save a picked/taken photo on this device; returns its reference for Place.photos */
export async function savePhotoFile(file: Blob): Promise<string> {
  const { blob, w, h } = await shrink(file)
  const id = crypto.randomUUID()
  await db.photos.add({ id, blob, w, h, createdAt: Date.now() })
  return LOCAL + id
}

// ---- Showing photos: one object URL per local photo, shared by every <img> ----
const urls = new Map<string, Promise<string | null>>()

export function photoSrc(ref: string): Promise<string | null> {
  if (!isLocalPhoto(ref)) return Promise.resolve(ref)
  let p = urls.get(ref)
  if (!p) {
    p = db.photos.get(localId(ref)).then(r => (r ? URL.createObjectURL(r.blob) : null))
    urls.set(ref, p)
  }
  return p
}

/** Remove local photos no place points to any more (after deletes, once undo is no longer possible) */
export async function cleanUpPhotos() {
  const used = new Set<string>()
  await db.places.each((p) => {
    for (const r of p.photos ?? []) if (isLocalPhoto(r)) used.add(localId(r))
  })
  const orphans = (await db.photos.toCollection().primaryKeys()).filter(id => !used.has(id))
  if (orphans.length) await db.photos.bulkDelete(orphans)
  return orphans.length
}

// ---- Backups carry local photos as data URLs ----
export async function photosForBackup(refs: Iterable<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const ref of refs) {
    if (!isLocalPhoto(ref) || out[localId(ref)]) continue
    const r = await db.photos.get(localId(ref))
    if (r) out[r.id] = await blobToDataUrl(r.blob)
  }
  return out
}

export async function restorePhotos(data: Record<string, unknown> | undefined) {
  if (!data || typeof data !== 'object') return 0
  let n = 0
  for (const [id, url] of Object.entries(data)) {
    if (typeof url !== 'string' || !/^data:image\/(webp|jpeg|png|gif|avif);base64,/.test(url)) continue
    if (await db.photos.get(id)) continue
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob).catch(() => null)
    if (!bmp) continue
    await db.photos.put({ id, blob, w: bmp.width, h: bmp.height, createdAt: Date.now() } satisfies PhotoBlob)
    bmp.close?.()
    n++
  }
  return n
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
