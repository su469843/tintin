import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import ttsProxyPlugin from './vite-plugins/ttsProxy.js'

export default defineConfig({
  plugins: [
    vue(),
    ttsProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: '英语听写应用',
        short_name: '听写',
        description: '英语听写练习应用 - 支持多词库、错词本、语音朗读',
        theme_color: '#3b82f6',
        background_color: '#f0f4f8',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,png,ico}']
      }
    })
  ]
})
