// Service worker for the installable web app (never registered in Tauri or `vite dev`).
// - The app shell (`/`) and the hashed bundles it references are cached on install.
// - Navigations go to the network first and fall back to the cached shell offline.
// - `/assets/*` files are content-hashed, so they are served cache-first.
// - `/api/*` and other origins are never cached: boards sync through the API.

const VERSION = 'v1'
const CACHE = `ideaplanner-${VERSION}`
const SHELL = '/'
const STATIC = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const res = await fetch(SHELL, { cache: 'no-cache' })
      if (res.ok) {
        const html = await res.clone().text()
        await cache.put(SHELL, res)
        // The bundles the shell loads, so the first offline start works too.
        const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])]
        await Promise.all([...assets, ...STATIC].map((url) => cache.add(url).catch(() => undefined)))
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('ideaplanner-') && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

// The page lists the bundles it loaded before this worker took over.
self.addEventListener('message', (event) => {
  const { type, assets } = event.data ?? {}
  if (type !== 'cache-assets' || !Array.isArray(assets)) return
  const urls = assets.filter((a) => typeof a === 'string' && a.startsWith('/assets/'))
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const url of urls) if (!(await cache.match(url))) await cache.add(url).catch(() => undefined)
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req))
  } else if (STATIC.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)))
  }
})

/** Every route serves the same SPA shell, so the latest one is kept under `/`. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) await cache.put(SHELL, res.clone())
    return res
  } catch {
    return (await cache.match(SHELL)) ?? Response.error()
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(req, res.clone())
  return res
}
