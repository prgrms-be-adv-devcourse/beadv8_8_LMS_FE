import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { isApiError } from '@/shared/api/ApiError'
import { clearAccessToken, setAccessToken } from '@/shared/auth/token'
import { mockChatbot, sseResponse, tooManyRequests } from '@/test/chatbotMock'
import { rs } from '@/test/renderApp'
import { server } from '@/test/server'
import { streamChat } from './stream'
import type { ChatStreamEvent } from './types'

afterEach(() => clearAccessToken())

async function collect(message = '안녕') {
  const events: ChatStreamEvent[] = []
  await streamChat({ message, history: [] }, { onEvent: (e) => events.push(e) })
  return events
}

describe('streamChat', () => {
  it('Bearer 토큰과 본문을 보내고 이벤트를 순서대로 넘긴다', async () => {
    setAccessToken('t1', 900)
    let auth: string | null = null
    let body: unknown = null
    server.use(
      http.post('*/api/v1/chatbot/messages/stream', async ({ request }) => {
        auth = request.headers.get('Authorization')
        body = await request.json()
        return sseResponse([
          { event: 'token', data: { text: '환불은 ' } },
          { event: 'token', data: { text: '지갑에서 해요.' } },
          {
            event: 'done',
            data: { sources: [{ code: 'HP_REFUND', question: '환불?' }] },
          },
        ])
      }),
    )
    expect(await collect('환불은?')).toEqual([
      { type: 'token', text: '환불은 ' },
      { type: 'token', text: '지갑에서 해요.' },
      {
        type: 'done',
        sources: [{ code: 'HP_REFUND', question: '환불?' }],
        fallback: false,
      },
    ])
    expect(auth).toBe('Bearer t1')
    expect(body).toEqual({ message: '환불은?', history: [] })
  })

  it('429면 스트림을 열지 않고 code·Retry-After가 담긴 오류를 던진다', async () => {
    setAccessToken('t1', 900)
    mockChatbot({ stream: () => tooManyRequests(20) })
    const error = await collect().catch((e: unknown) => e)
    expect(isApiError(error, 'TOO_MANY_REQUESTS')).toBe(true)
    expect(isApiError(error) && error.retryAfter).toBe(20)
  })

  it('401이면 토큰을 다시 받아 한 번만 다시 보낸다', async () => {
    setAccessToken('old', 900)
    const seen: (string | null)[] = []
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        rs({ accessToken: 'new', expiresIn: 900 }),
      ),
      http.post('*/api/v1/chatbot/messages/stream', ({ request }) => {
        const auth = request.headers.get('Authorization')
        seen.push(auth)
        return auth === 'Bearer new'
          ? sseResponse([{ event: 'done', data: {} }])
          : new HttpResponse(null, { status: 401 })
      }),
    )
    expect(await collect()).toEqual([
      { type: 'done', sources: [], fallback: false },
    ])
    expect(seen).toEqual(['Bearer old', 'Bearer new'])
  })

  it('refresh token이 거절되면 로그인이 끝난 오류로 던진다', async () => {
    setAccessToken('old', 900)
    server.use(
      http.post(
        '*/api/v1/chatbot/messages/stream',
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    const error = await collect().catch((e: unknown) => e)
    expect(isApiError(error, 'UNAUTHORIZED') && error.sessionEnded).toBe(true)
  })
})
