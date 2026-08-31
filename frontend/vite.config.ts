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
  server: { port: 5173 },
})