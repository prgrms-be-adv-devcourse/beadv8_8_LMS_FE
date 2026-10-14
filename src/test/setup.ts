import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { resetLectureDb } from '@/mocks/lecture'
import { FakeStompClient } from './fakeStomp'
import { server } from './server'

// CI처럼 느린 환경에서도 화면 전환·재조회를 기다릴 수 있게 findBy·waitFor 대기를 늘린다(기본 1초).
configure({ asyncUtilTimeout: 5000 })

// 채팅 실시간 연결은 가짜 STOMP 클라이언트로 바꾼다(jsdom에서 실제 WebSocket을 열지 않는다).
vi.mock('@stomp/stompjs', () => ({ Client: FakeStompClient }))

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetLectureDb()
  FakeStompClient.reset()
  cleanup()
  document.cookie.split('; ').forEach((c) => {
    document.cookie = `${c.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  })
})
afterAll(() => server.close())
