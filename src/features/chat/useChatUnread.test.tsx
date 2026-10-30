import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { chatKeys } from '@/entities/chat/api'
import { server } from '@/test/server'
import { useChatStore } from './chatStore'
import { useMarkRoomRead } from './useChatUnread'

afterEach(() => {
  useChatStore.setState({ pending: {} })
  vi.restoreAllMocks()
})

describe('읽음 처리의 참여 세대', () => {
  it('세대가 바뀐 뒤 도착한 옛 세대 읽음의 409는 새 세대의 이력·보내는 중 표시를 버리지 않는다', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    document.cookie = 'XSRF-TOKEN=t'
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const bodies: unknown[] = []
    server.use(
      http.put('*/api/v1/chats/5/read', async ({ request }) => {
        const body = (await request.json()) as { participationVersion: number }
        bodies.push(body)
        if (body.participationVersion === 2) {
          await gate
          return HttpResponse.json(
            { status: 409, code: 'STALE_PARTICIPATION', detail: '옛 세대' },
            { status: 409 },
          )
        }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { rerender } = renderHook(
      ({ version }: { version: number }) => useMarkRoomRead(5, 3, version),
      { wrapper, initialProps: { version: 2 } },
    )
    await waitFor(() => expect(bodies).toHaveLength(1))

    // 옛 세대(2) 읽음 응답을 기다리는 사이 새 세대(3)로 바뀌고, 새 세대에서 보낸 메시지가 있다.
    queryClient.setQueryData(chatKeys.messages(5), {
      pages: [{ messages: [], nextCursor: null }],
      pageParams: [null],
    })
    useChatStore.setState({
      pending: {
        5: [{ clientMessageId: 'new', content: '새 세대', status: 'sending' }],
      },
    })
    rerender({ version: 3 })
    await waitFor(() => expect(bodies).toHaveLength(2))
    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    expect(useChatStore.getState().pending[5]).toHaveLength(1)
    expect(queryClient.getQueryData(chatKeys.messages(5))).toBeDefined()
  })

  it('화면 캐시는 아직 옛 세대여도 채팅 연결이 새 세대를 관측했으면, 옛 세대 읽음의 409로 새 세대 보내는 중 표시를 지우지 않는다', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    document.cookie = 'XSRF-TOKEN=t'
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.put('*/api/v1/chats/5/read', async () => {
        await gate
        return HttpResponse.json(
          { status: 409, code: 'STALE_PARTICIPATION', detail: '옛 세대' },
          { status: 409 },
        )
      }),
    )
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    renderHook(() => useMarkRoomRead(5, 3, 2), { wrapper })
    await waitFor(() => expect(queryClient.isMutating()).toBe(1))

    // 새 세대(3) 최신 페이지를 받는 중이라 화면은 아직 세대 2지만, 연결은 세대 3을 관측했고 새 세대에서 보냈다.
    queryClient.setQueryData(chatKeys.messages(5), {
      pages: [{ messages: [], nextCursor: null }],
      pageParams: [null],
    })
    useChatStore.setState({
      generationOf: (id) => (id === 5 ? 3 : undefined),
      pending: {
        5: [{ clientMessageId: 'new', content: '새 세대', status: 'sending' }],
      },
    })
    onTestFinished(() =>
      useChatStore.setState({ generationOf: () => undefined }),
    )
    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    expect(useChatStore.getState().pending[5]).toHaveLength(1)
    expect(queryClient.getQueryData(chatKeys.messages(5))).toBeDefined()
  })

  it('화면을 떠난 뒤 도착한 읽음 409는 다시 들어와 만든 새 상태를 지우지 않는다', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    document.cookie = 'XSRF-TOKEN=t'
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let reads = 0
    server.use(
      http.put('*/api/v1/chats/5/read', async () => {
        reads++
        await gate
        return HttpResponse.json(
          { status: 409, code: 'STALE_PARTICIPATION', detail: '옛 세대' },
          { status: 409 },
        )
      }),
    )
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { unmount } = renderHook(() => useMarkRoomRead(5, 3, 2), { wrapper })
    await waitFor(() => expect(reads).toBe(1))
    unmount()

    // 다른 탭에서 다시 들어와 새 세대로 화면을 다시 열고 메시지를 보냈다.
    queryClient.setQueryData(chatKeys.messages(5), {
      pages: [{ messages: [], nextCursor: null }],
      pageParams: [null],
    })
    useChatStore.setState({
      pending: {
        5: [{ clientMessageId: 'new', content: '새 세대', status: 'sending' }],
      },
    })
    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    expect(useChatStore.getState().pending[5]).toHaveLength(1)
    expect(queryClient.getQueryData(chatKeys.messages(5))).toBeDefined()
  })
})
