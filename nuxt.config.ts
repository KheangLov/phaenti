// Client-only, statically generated PWA. All user data stays on the device.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],

  ui: { fonts: false },
  icon: {
    provider: 'none',
    clientBundle: {
      scan: true,
      sizeLimitKb: 96,
      // Icons referenced dynamically (categories)
      icons: ['utensils', 'coffee', 'wine', 'landmark', 'trees', 'umbrella', 'mountain', 'bed-double', 'shopping-bag', 'palette', 'plane', 'map-pin', 'map', 'building-2', 'home', 'flag', 'history', 'link', 'navigation', 'search', 'x', 'chevron-right', 'arrow-up-left', 'house', 'briefcase-business', 'users-round', 'heart-handshake', 'car-front', 'motorbike', 'bike', 'footprints', 'circle-dot', 'flag', 'arrow-up', 'arrow-up-right', 'corner-up-right', 'undo-2', 'corner-up-left', 'split', 'merge', 'rotate-cw', 'ship', 'route', 'ruler', 'sparkles', 'flame', 'bookmark-plus', 'bookmark-check', 'bookmark-minus', 'badge-check', 'image', 'image-off', 'image-plus', 'camera', 'link', 'link-2-off', 'external-link', 'star', 'loader-circle', 'utensils', 'coffee', 'wine', 'landmark', 'trees', 'umbrella', 'mountain', 'bed-double', 'shopping-bag', 'palette', 'plane', 'map-pin'].map(i => `lucide:${i}`),
    },
  },
  colorMode: { preference: 'system', fallback: 'light' },

  app: {
    head: {
      title: 'Phaenti — ផែនទី',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content' },
        { name: 'description', content: 'Places you have been and places you want to go. Private, offline, on your phone.' },
        { name: 'theme-color', content: '#f8fafc', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0f172a', media: '(prefers-color-scheme: dark)' },
        { name: 'apple-mobile-web-app-title', content: 'Phaenti' },
        { name: 'application-name', content: 'Phaenti' },
        { name: 'format-detection', content: 'telephone=no' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // Open connections to the tile servers while the app itself is still loading
        { rel: 'preconnect', href: 'https://tiles.openfreemap.org', crossorigin: '' },
        { rel: 'preconnect', href: 'https://tiles.versatiles.org', crossorigin: '' },
        { rel: 'dns-prefetch', href: 'https://tiles.openfreemap.org' },
        { rel: 'dns-prefetch', href: 'https://tiles.versatiles.org' },
      ],
    },
  },

  experimental: { payloadExtraction: false },

  vite: {
    build: { target: 'es2022', cssCodeSplit: true },
    optimizeDeps: { include: ['maplibre-gl', 'dexie', 'motion-v'] },
  },

  pwa: {
    // Ask before swapping in a new version, so an update never interrupts you
    registerType: 'prompt',
    includeAssets: ['favicon.png', 'apple-touch-icon.png'],
    manifest: {
      id: '/',
      name: 'Phaenti — ផែនទី',
      short_name: 'Phaenti',
      description: 'Your private travel map of Cambodia and beyond: places you have been and places you want to go. Works offline.',
      lang: 'en',
      dir: 'ltr',
      start_url: '/?source=pwa',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'portrait',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      categories: ['travel', 'navigation', 'lifestyle'],
      prefer_related_applications: false,
      launch_handler: { client_mode: ['focus-existing', 'auto'] },
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      screenshots: [
        { src: '/screenshots/explore.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Explore Cambodia by province' },
        { src: '/screenshots/place.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Save places with categories' },
        { src: '/screenshots/search.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Search provinces, villages and places' },
      ],
      shortcuts: [
        { name: 'Add a place', short_name: 'Add', url: '/?action=add', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
        { name: 'Search', short_name: 'Search', url: '/?action=search', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
      ],
    },
    workbox: {
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/admin\//],
      // App shell + Cambodia boundaries, names and search index: all available offline from first launch
      globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico,webmanifest,woff2}', 'admin/**/*.{json,pbf}', 'styles/*.json', 'geo/*.json', 'discover/*.json'],
      globIgnores: ['screenshots/**'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      // Nuxt adds its prerendered /200 and /404 shells; they're identical to "/" and
      // not served at those paths on every host, which would break SW install.
      manifestTransforms: [
        async entries => ({
          manifest: entries.filter((e, i, all) => !['200', '404', '200.html', '404.html'].includes(e.url) && all.findIndex(x => x.url === e.url) === i),
          warnings: [],
        }),
      ],
      clientsClaim: true,
      runtimeCaching: [
        {
          // Map style JSON: fresh when online, cached when offline
          urlPattern: /^https:\/\/tiles\.openfreemap\.org\/styles\/.*/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'map-styles', cacheableResponse: { statuses: [0, 200] } },
        },
        {
          // Tile index (TileJSON): points at the current tile version, so refresh it in the
          // background instead of pinning an old version for months
          urlPattern: /^https:\/\/tiles\.openfreemap\.org\/[a-z]+\/?$/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'map-styles', cacheableResponse: { statuses: [0, 200] } },
        },
        {
          // Vector tiles, fonts, sprites: versioned URLs, safe to cache-first.
          // "Save area for offline" writes into this same cache.
          urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'map-tiles',
            expiration: { maxEntries: 40000, maxAgeSeconds: 60 * 60 * 24 * 120 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // VersaTiles tiles, glyphs, sprites (styles are bundled in /styles)
          urlPattern: /^https:\/\/tiles\.versatiles\.org\/.*/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'map-tiles',
            expiration: { maxEntries: 40000, maxAgeSeconds: 60 * 60 * 24 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // Discover photos and descriptions from Wikipedia / Wikimedia
          urlPattern: /^https:\/\/en\.wikipedia\.org\/w\/api\.php.*/,
          handler: 'NetworkFirst',
          options: { cacheName: 'wiki', networkTimeoutSeconds: 6, expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
        },
        {
          // Place photos from the web (links you add, Wikimedia thumbnails): keep for offline
          urlPattern: ({ request, url }: { request: Request; url: URL }) => request.destination === 'image' && url.origin !== self.location.origin && !/tiles\.(openfreemap|versatiles)\.org/.test(url.hostname),
          handler: 'CacheFirst',
          options: { cacheName: 'photos', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true }, cacheableResponse: { statuses: [0, 200] } },
        },
        {
          // Routing is live only: never serve a stale route
          urlPattern: /^https:\/\/(valhalla1|routing)\.openstreetmap\.de\/.*/,
          handler: 'NetworkOnly',
        },
        {
          urlPattern: /^https:\/\/photon\.komoot\.io\/.*/,
          handler: 'NetworkFirst',
          options: { cacheName: 'geocoding', networkTimeoutSeconds: 4, expiration: { maxEntries: 300 } },
        },
      ],
    },
    client: { installPrompt: true, periodicSyncForUpdates: 3600 },
    devOptions: { enabled: false },
  },
})
