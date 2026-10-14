import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.app.json의 paths와 맞춘다.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // 운영처럼 같은 출처에서 /api를 호출하도록 로컬 BE로 넘긴다(docs/deploy.md).
    proxy: { '/api': 'http://localhost:8080' },
  },
})
