/// <reference types="svelte" />

import type { API } from '../main/preload'

declare global {
  interface Window {
    api: API
  }
}
