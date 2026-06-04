import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base is '/morel-v3/' for GitHub Pages (served at /<repo-name>/)
// and '/' for local dev and other providers.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/morel-v3/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
