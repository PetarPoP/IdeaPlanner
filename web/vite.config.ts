import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The app is fully client-rendered (SPA mode) so the same static build runs
// in the browser, inside the Tauri desktop shell and on Android/iOS.
// Set by `tauri android dev` / `tauri ios dev` so a device can reach the dev server.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 3001 } : undefined,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: '/index.html' } },
    }),
    viteReact(),
  ],
  resolve: { tsconfigPaths: true },
})
