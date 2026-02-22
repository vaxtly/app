/**
 * Toast notification store — surfaces vault/git failures as brief pop-ups.
 * Supports pause/resume on hover.
 */

export interface Toast {
  id: string
  category: 'sync' | 'vault'
  message: string
  timestamp: number
}

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 8_000

let toasts = $state<Toast[]>([])

// Timer bookkeeping: track remaining time so we can pause/resume
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const startedAt = new Map<string, number>()
const remaining = new Map<string, number>()

let nextId = 0

function addToast(category: Toast['category'], message: string): void {
  const id = `toast-${++nextId}`
  const toast: Toast = { id, category, message, timestamp: Date.now() }

  toasts = [toast, ...toasts]

  // Evict oldest if over capacity
  while (toasts.length > MAX_VISIBLE) {
    const oldest = toasts[toasts.length - 1]
    dismissToast(oldest.id)
  }

  scheduleDismiss(id, AUTO_DISMISS_MS)
}

function scheduleDismiss(id: string, ms: number): void {
  remaining.set(id, ms)
  startedAt.set(id, Date.now())
  timers.set(id, setTimeout(() => dismissToast(id), ms))
}

function pauseToast(id: string): void {
  const timer = timers.get(id)
  if (!timer) return
  clearTimeout(timer)
  timers.delete(id)

  const start = startedAt.get(id) ?? Date.now()
  const rem = remaining.get(id) ?? AUTO_DISMISS_MS
  remaining.set(id, Math.max(0, rem - (Date.now() - start)))
}

function resumeToast(id: string): void {
  if (timers.has(id)) return // already running
  const rem = remaining.get(id)
  if (rem == null) return
  scheduleDismiss(id, rem)
}

function dismissToast(id: string): void {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  startedAt.delete(id)
  remaining.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
}

export const toastsStore = {
  get toasts() { return toasts },
  addToast,
  dismissToast,
  pauseToast,
  resumeToast,
}
