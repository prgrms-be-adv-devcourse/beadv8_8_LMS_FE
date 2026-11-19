import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { clearAccessToken } from '@/shared/auth/token'
import { resetToast } from '@/shared/ui/toastStore'
import { FakeStompClient } from './fakeStomp'
import { server } from './server'

// CI처럼 느린 환경에서도 화면 전환·재조회를 기다릴 수 있게 findBy·waitFor 대기를 늘린다(기본 1초).
configure({ asyncUtilTimeout: 5000 })

// 테스트 예시 데이터는 2026년 날짜다. 날짜 표시는 올해가 아니면 연도를 붙이므로, 해가 바뀌어도 날짜 글자 단언이
// 깨지지 않게 '올해'를 정하는 시각만 2026년으로 고정한다(다른 시각 계산은 실제 시각 그대로).
vi.mock('@/shared/lib/clock', () => ({
  today: () => new Date('2026-11-19T12:00:00+09:00'),
}))

// 채팅 실시간 연결은 가짜 STOMP 클라이언트로 바꾼다(jsdom에서 실제 WebSocket을 열지 않는다).
vi.mock('@stomp/stompjs', () => ({
  Client: FakeStompClient,
  ReconnectionTimeMode: { LINEAR: 0, EXPONENTIAL: 1 },
}))

// jsdom은 창 스크롤을 구현하지 않는다(부르면 not implemented 오류를 남긴다). 화면을 옮길 때 맨 위로 보내는
// 앱 셸의 ScrollRestoration이 부르므로 아무것도 하지 않는 함수로 둔다. 테스트에서 호출을 보려면 vi.spyOn으로 감싼다.
window.scrollTo = (() => {}) as typeof window.scrollTo

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
// jsdom은 document.hasFocus()가 늘 false다. 사용자가 화면을 보고 있는 것으로 둔다(채팅 읽음 처리 기준).
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  // 흉내 응답·토큰·쿠키는 테스트 파일의 afterEach(남은 조회를 기다리는 settle 등)가 끝난 뒤 되돌린다.
  // beforeEach가 돌려준 정리 함수는 모든 afterEach 뒤에 돈다.
  return () => {
    server.resetHandlers()
    resetToast()
    FakeStompClient.reset()
    // access token은 모듈 메모리에 있어 테스트 사이에 남는다.
    clearAccessToken()
    document.cookie.split('; ').forEach((c) => {
      document.cookie = `${c.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  }
})
// 화면은 테스트 파일의 afterEach보다 먼저 내린다(vite.config의 sequence.hooks가 'list'라 이 afterEach가 먼저 돈다).
// 화면이 붙은 채 파일의 afterEach가 캐시를 비우면, 아직 돌지 않은 useQuery effect나 다시 그리기가 지운 쿼리를 새로
// 만들어 요청을 보내고, 그 요청이 늦게 나가 다음 테스트의 흉내 응답에 잡힌다(느린 환경에서 첫 쪽 요청이 두 번 잡혔다).
// 그래서 테스트 파일에서 cleanup()을 따로 부르지 않아도 된다.
afterEach(() => cleanup())
afterAll(() => server.close())
