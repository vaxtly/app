/**
 * Toast notification store — surfaces vault/git failures as brief pop-ups.
 * Supports pause/resume on hover.
 */

export interface Toast {
  id: string
  category: 'sync' | 'vault' | 'update'
  message: string
  timestamp: number
}

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 8_000

let toasts = $state<Toast[]>([])

// Timer bookkeeping consolidated into a single Map
interface TimerState {
  timer: ReturnType<typeof setTimeout>
  startedAt: number
  remaining: number
}
const timerStates = new Map<string, TimerState>()

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
  timerStates.set(id, {
    timer: setTimeout(() => dismissToast(id), ms),
    startedAt: Date.now(),
    remaining: ms,
  })
}

function pauseToast(id: string): void {
  const state = timerStates.get(id)
  if (!state) return
  clearTimeout(state.timer)
  state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt))
}

function resumeToast(id: string): void {
  const state = timerStates.get(id)
  if (!state) return
  state.timer = setTimeout(() => dismissToast(id), state.remaining)
  state.startedAt = Date.now()
}

function dismissToast(id: string): void {
  const state = timerStates.get(id)
  if (state) clearTimeout(state.timer)
  timerStates.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
}

export const toastsStore = {
  get toasts() { return toasts },
  addToast,
  dismissToast,
  pauseToast,
  resumeToast,
}
