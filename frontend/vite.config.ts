import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = 'http://127.0.0.1:3000'

const proxyPaths = [
  '/studio',
  '/issues',
  '/projects',
  '/users',
  '/time_entries',
  '/news',
  '/documents',
  '/wiki',
  '/attachments',
  '/queries',
  '/trackers',
  '/issue_statuses',
  '/custom_fields',
  '/roles',
  '/groups',
  '/enumerations',
  '/search',
  '/my',
  '/journals',
  '/versions',
  '/files',
]

const proxy = Object.fromEntries(
  proxyPaths.map((path) => [path, { target: backend, changeOrigin: true }]),
)

export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy,
  },
})
