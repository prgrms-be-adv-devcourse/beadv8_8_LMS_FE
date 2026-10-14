/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // MSW 워커 스크립트는 개발 서버에서만 제공한다. 빌드 산출물에는 넣지 않는다.
  plugins: [
    react(),
    ...(command === 'serve' ? [msw({ mode: 'worker-only' })] : []),
  ],
  resolve: {
    // tsconfig.app.json의 paths와 맞춘다.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // 운영처럼 같은 출처에서 /api를 호출하도록 로컬 BE로 넘긴다(docs/deploy.md).
    // ws: 채팅 STOMP(/api/v1/chats/ws)도 같은 경로로 넘긴다.
    proxy: { '/api': { target: 'http://localhost:8080', ws: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
