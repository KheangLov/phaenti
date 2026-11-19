// Native-style back behaviour: the phone's Back button / swipe-back gesture
// closes the top-most panel (search, place card, sheet, drawer…) instead of
// leaving the app.
//
// We keep exactly one history entry per open layer. Panels can open and close
// in the same tick (e.g. a search result opens a place card while search
// closes), and history.go() is asynchronous, so entries are reconciled in a
// microtask and never while a programmatic go() is still in flight.

interface Layer { id: string; close: () => void }
const stack: Layer[] = [] // open layers, oldest first
let depth = 0 // our history entries currently above the app's base entry
let pending = false // waiting for our own history.go() to land
let scheduled = false
let installed = false

function reconcile() {
  scheduled = false
  if (pending) return
  const want = stack.length
  if (want > depth) {
    for (let i = depth; i < want; i++) history.pushState({ phaenti: i + 1 }, '')
    depth = want
  } else if (want < depth) {
    pending = true
    const n = depth - want
    depth = want
    history.go(-n)
  }
}

function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(reconcile)
}

function install() {
  if (installed || !import.meta.client) return
  installed = true
  window.addEventListener('popstate', () => {
    if (pending) {
      // Our own history.go() landed
      pending = false
      schedule()
      return
    }
    // The user pressed Back: the browser already moved one entry back
    depth = Math.max(0, depth - 1)
    const top = stack.pop()
    if (top) {
      top.close()
      haptic('tap')
    }
    schedule()
  })
}

/** While `isOpen()` is true, the phone's Back closes this layer via `close()`. */
export function useBackLayer(id: string, isOpen: () => boolean, close: () => void) {
  if (!import.meta.client) return
  install()
  watch(isOpen, (open) => {
    const i = stack.findIndex(l => l.id === id)
    if (open && i < 0) stack.push({ id, close })
    else if (!open && i >= 0) stack.splice(i, 1)
    else return
    schedule()
  })
}
