import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The version is kept only in package.json and injected into the bundle, so the number shown in
// the footer can't drift from the one a release is tagged with.
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `prompt`, not `autoUpdate`: an auto-updating worker takes control by itself - on the very
      // first visit too - and every takeover reloaded the page (`UpdatePrompt`), so a first opening
      // loaded several times and a deploy reloaded the planner mid-drag. Now the new version waits,
      // the prompt offers it, and the page reloads only when asked.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GuestSeat — Wedding Seating Planner',
        short_name: 'GuestSeat',
        description: 'Import a guest list and arrange table seating with drag-and-drop.',
        theme_color: '#4338ca',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        globIgnores: ['**/vendor-excel*', '**/vendor-pdf*', '**/exceljs*', '**/jspdf*', '**/html2canvas*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // No `clientsClaim` / `skipWaiting`: both make a new worker take over the moment it
        // installs, which is exactly what `prompt` exists to stop - the new version has to wait for
        // «Update now» (`UpdatePrompt`), or the prompt never has anything to offer.
        // Serve the SPA shell for any navigation while offline.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('vendor-excel') ||
              url.pathname.includes('exceljs') ||
              url.pathname.includes('vendor-pdf') ||
              url.pathname.includes('jspdf') ||
              url.pathname.includes('html2canvas'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'guestseat-export-libs',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('exceljs')) return 'vendor-excel';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
            if (id.includes('@dnd-kit')) return 'vendor-dnd';
            if (id.includes('qrcode')) return 'vendor-qr';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
