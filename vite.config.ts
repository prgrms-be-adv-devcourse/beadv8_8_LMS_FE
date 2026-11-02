/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 개발 서버 전용 설정은 VITE_ 접두사 없이 읽는다(번들에 들어가지 않는다). .env.local이나 셸 환경변수로 바꾼다.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    resolve: {
      // tsconfig.app.json의 paths와 맞춘다.
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // 운영처럼 같은 출처에서 /api를 호출하도록 로컬 Envoy(BE docker/compose.yaml의 envoy, 기본 8000)로 넘긴다(docs/deploy.md).
      // Envoy가 Bearer 토큰을 검증해 BE 앱에 X-User-Id·X-User-Role을 넣고 앱별로 나눠 보낸다.
      // ws: 채팅 STOMP(/api/v1/chats/ws)도 같은 곳으로 넘긴다.
      // 키가 ^로 시작하면 정규식이다. /apiary 같은 다른 경로까지 넘기지 않게 /api와 그 아래만 맞춘다.
      proxy: {
        '^/api(/|$)': {
          target: env.API_PROXY_TARGET || 'http://localhost:8000',
          ws: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // 화면 흐름 테스트는 입력·대기(findBy 5초)가 여러 번이라, 느린 CI에서도 끝나도록 넉넉히 둔다(기본 5초).
      testTimeout: 15_000,
    },
  }
})
