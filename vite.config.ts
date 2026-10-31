import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { textTool } from './src/dev/texts/vite-plugin'

const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version
// Vercel builds from a clone without .git history sometimes, but always sets this.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || (() => {
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch {
    return ''
  }
})()).slice(0, 7)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    // A Vercel preview deployment (a branch, not the real app): the Developer section shows there for testing.
    __APP_PREVIEW__: JSON.stringify(process.env.VERCEL_ENV === 'preview'),
  },
  plugins: [
    react(),
    textTool(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        id: '/',
        name: 'Smart Meta',
        short_name: 'Meta',
        description: 'Goals that survive the moment of decision.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f3ee',
        theme_color: '#f5f3ee',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Push and tapping a push (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
