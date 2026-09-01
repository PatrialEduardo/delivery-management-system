import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Delivery Management System',
        short_name: 'DMS',
        theme_color: '#0f172a',
        icons: [], // add real icons later
      },
    }),
  ],
  // usePolling: file-change events don't cross the Docker bind mount
  // reliably on Windows/WSL2, so poll instead. Harmless outside Docker.
  server: { port: 5173, watch: { usePolling: true } },
})