import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: '/p2p-share/',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'P2P Share',
          short_name: 'P2PShare',
          description: 'Secure Peer-to-Peer file sharing and chat',
          theme_color: '#0A0A0A',
          background_color: '#0A0A0A',
          display: 'standalone',
          scope: '/p2p-share/',
          start_url: '/p2p-share/',
          icons: [
            {
              src: 'icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    server: {
      host: '0.0.0.0',
      port: 5173
    },
  }
})