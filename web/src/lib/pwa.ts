import { isTauri } from '@tauri-apps/api/core'

/**
 * Makes the web build installable and usable offline (`public/sw.js`).
 * Production browser builds only: Tauri ships its own files, and a service
 * worker under `vite dev` would serve stale modules.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || isTauri() || !('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // Bundles this page loaded before the worker was in charge (lazy route
      // chunks, fonts), so the next start works offline too.
      const assets = performance
        .getEntriesByType('resource')
        .map((e) => new URL(e.name))
        .filter((u) => u.origin === location.origin && u.pathname.startsWith('/assets/'))
        .map((u) => u.pathname)
      reg.active?.postMessage({ type: 'cache-assets', assets })
    })
    .catch(() => {
      // Not installable here (plain http, private mode); the app works without it.
    })
}
