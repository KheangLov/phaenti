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
    clientBundle: { scan: true, sizeLimitKb: 64 },
  },
  colorMode: { preference: 'system', fallback: 'light' },

  app: {
    head: {
      title: 'Phaenti — ផែនទី',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content' },
        { name: 'description', content: 'Places you have been and places you want to go. Private, offline, on your phone.' },
        { name: 'theme-color', content: '#0f172a' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://tiles.openfreemap.org', crossorigin: '' },
      ],
    },
  },

  experimental: { payloadExtraction: false },

  vite: {
    build: { target: 'es2022', cssCodeSplit: true },
    optimizeDeps: { include: ['maplibre-gl', 'dexie', 'motion-v'] },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Phaenti — ផែនទី',
      short_name: 'Phaenti',
      description: 'Places you have been and places you want to go.',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico,webmanifest}'],
      runtimeCaching: [
        {
          // Map style JSON: fresh when online, cached when offline
          urlPattern: /^https:\/\/tiles\.openfreemap\.org\/styles\/.*/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'map-styles', cacheableResponse: { statuses: [0, 200] } },
        },
        {
          // Vector tiles, fonts, sprites: versioned URLs, safe to cache-first
          urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'map-tiles',
            expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 45 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /^https:\/\/photon\.komoot\.io\/.*/,
          handler: 'NetworkFirst',
          options: { cacheName: 'geocoding', networkTimeoutSeconds: 4, expiration: { maxEntries: 200 } },
        },
      ],
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },
})
