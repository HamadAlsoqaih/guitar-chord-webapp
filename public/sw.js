/**
 * Makes the app open instantly after the first visit, and work with no network.
 *
 * Two rules, because the files fall into two kinds:
 *
 *   - Anything under assets/ is content-hashed by the build or is a character file
 *     that never changes. Those are served from the cache and only fetched once. A
 *     deploy produces new filenames, so there is no such thing as a stale one.
 *   - Everything else — the page itself above all — is fetched from the network
 *     first and only falls back to the cache when there is no network. The page is
 *     what names the current asset filenames, so serving an old copy of it would
 *     pin the whole app to an old version, which is exactly the kind of bug that
 *     has people clearing site data.
 *
 * The cache name carries a version: changing it drops everything an older worker
 * stored, on the next activation.
 */
const CACHE = 'chord-roller-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      /*
       * Take a copy of the page itself straight away. The first visit finished
       * loading before this worker existed, so nothing it fetched went through
       * here — without this, the second visit has a worker but an empty cache and
       * an offline launch has nothing to open.
       */
      try {
        const cache = await caches.open(CACHE)
        await cache.add(new Request('./', { cache: 'reload' }))
      } catch {
        /* offline at install time; the next visit will fill it in */
      }
      // Take over rather than waiting for every tab on the old worker to close —
      // a deploy should reach people on their next load.
      await self.skipWaiting()
    })()
  )
})

/**
 * The page tells the worker what it loaded.
 *
 * Everything the first visit fetched was fetched before this worker was running, so
 * it is not in the cache and would have to be downloaded again. Rather than keeping
 * a generated list of build outputs in step with the build, the page simply reports
 * what it actually used and those are stored.
 */
self.addEventListener('message', (event) => {
  const { type, urls } = event.data || {}
  if (type !== 'warm' || !Array.isArray(urls)) return
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.all(
        urls.map(async (url) => {
          try {
            if (await cache.match(url, { ignoreVary: true })) return
            const response = await fetch(url, { cache: 'no-cache' })
            if (response.ok) await cache.put(url, response)
          } catch {
            /* one file failing to warm is not worth failing the rest for */
          }
        })
      )

      /*
       * Drop the previous build's bundles.
       *
       * Their names carry a content hash, so a deploy leaves the old ones cached
       * under names nothing will ever ask for again — and every deploy would add
       * another set. The page has just said which ones it is using, so anything
       * else of that kind is last time's. Only scripts and stylesheets are swept:
       * the character files keep their names from build to build, and deleting one
       * because this particular page did not happen to need it would only mean
       * fetching it again later.
       */
      const keeping = new Set(urls)
      const stale = (await cache.keys()).filter(
        (request) =>
          request.url.includes('/assets/') &&
          /\.(js|css)$/.test(new URL(request.url).pathname) &&
          !keeping.has(request.url)
      )
      await Promise.all(stale.map((request) => cache.delete(request)))
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })()
  )
})

/** Immutable once fetched: hashed bundles, and the character files. */
const isAsset = (url) => url.pathname.includes('/assets/')

/*
 * Vary is ignored on every lookup here, and deliberately.
 *
 * A cached entry normally only matches a request whose headers agree with whatever
 * the response's Vary header names — and these responses come back with `Vary:
 * Origin`, while the page's own module scripts are fetched with `crossorigin` and
 * so carry an Origin header the warm-up fetch did not. The two never matched, the
 * cache was full and useless, and an offline launch failed on every file. These are
 * static files at fixed URLs: the URL is the whole of their identity.
 */
const lookup = (request) => caches.match(request, { ignoreVary: true })

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await lookup(request)
        if (cached) return cached
        const response = await fetch(request)
        // Opaque or failed responses are not worth keeping; a bad one cached here
        // would survive until the next version bump.
        if (response.ok) {
          const cache = await caches.open(CACHE)
          cache.put(request, response.clone())
        }
        return response
      })()
    )
    return
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE)
          cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        const cached = await lookup(request)
        if (cached) return cached
        // A navigation with nothing cached and nothing online: hand back the app
        // shell if we have it, so an offline launch still opens the machine.
        if (request.mode === 'navigate') {
          const shell = await lookup(new URL('./', self.location).href)
          if (shell) return shell
        }
        throw error
      }
    })()
  )
})
