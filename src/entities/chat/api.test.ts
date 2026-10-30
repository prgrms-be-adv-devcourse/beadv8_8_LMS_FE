import { QueryClient } from '@tanstack/react-query'
import { http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rs } from '@/test/renderApp'
import { server } from '@/test/server'
import { chatMessagesQuery, observeChatPages, StaleChatPageError } from './api'

const page = { messages: [], nextCursor: null, participationVersion: 2 }

let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  stop = undefined
})

describe('이력 응답 관찰자', () => {
  it('요청을 보낸 뒤 관찰자가 바뀌면(회원 전환) 늦게 온 응답을 새 관찰자에 넘기지 않는다', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        await gate
        return rs(page)
      }),
    )
    const before = vi.fn(() => true)
    const after = vi.fn(() => true)
    stop = observeChatPages(before)
    const queryClient = new QueryClient()
    const loading = queryClient.fetchInfiniteQuery(chatMessagesQuery(5))

    // 응답을 기다리는 동안 다른 회원으로 바뀌어 새 채팅 연결이 관찰자를 등록했다.
    stop()
    stop = observeChatPages(after)
    release()
    await loading

    expect(before).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it('관찰자가 옛 세대 응답이라고 거절하면 캐시에 넣지 않고 조회를 실패시킨다', async () => {
    server.use(http.get('*/api/v1/chats/5/messages', () => rs(page)))
    stop = observeChatPages(() => false)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await expect(
      queryClient.fetchInfiniteQuery(chatMessagesQuery(5)),
    ).rejects.toBeInstanceOf(StaleChatPageError)
    expect(queryClient.getQueryData(chatMessagesQuery(5).queryKey)).toBe(
      undefined,
    )
  })
})
