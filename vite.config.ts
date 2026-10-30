/// <reference types="vitest/config" />
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
    // BE는 앱별로 나뉘어 있어 경로 앞부분으로 앱을 고른다(각 앱 application-local.yaml의 포트).
    // ws: 채팅 STOMP(/api/v1/chats/ws)도 같은 경로로 넘긴다.
    proxy: {
      '/api/v1/members': 'http://localhost:8081',
      '/api/v1/settlements': 'http://localhost:8082',
      '/api/v1/wallets': 'http://localhost:8082',
      '/api/v1/appearances': 'http://localhost:8083',
      '/api/v1/lectures': 'http://localhost:8084',
      '/api/v1/chats': { target: 'http://localhost:8085', ws: true },
      '/api/v1/inquiries': 'http://localhost:8086',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 화면 흐름 테스트는 입력·대기(findBy 5초)가 여러 번이라, 느린 CI에서도 끝나도록 넉넉히 둔다(기본 5초).
    testTimeout: 15_000,
  },
})
