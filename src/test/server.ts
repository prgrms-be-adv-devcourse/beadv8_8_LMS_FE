import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { handlers } from '@/mocks/handlers'

/**
 * 앱 셸이 화면과 상관없이 부르는 요청의 기본 응답. 테스트마다 server.use(...)로 덮어쓴다.
 * - 채팅 방 목록: 인플루언서·관리자는 내비 안 읽은 수 배지를 위해 항상 부른다
 */
const appShellDefaults = [
  http.get('*/api/v1/chats', () =>
    HttpResponse.json({ statusCode: 200, message: '', data: [] }),
  ),
]

/** 테스트용 MSW 서버. 테스트마다 server.use(...)로 응답을 정한다. */
export const server = setupServer(...handlers, ...appShellDefaults)
