import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import { useChatStore } from '@/features/chat/chatStore'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { FakeStompClient } from '@/test/fakeStomp'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PARTNER_ID = 8

const room = (
  patch: Partial<ChatRoom> = {},
  partnerActive = true,
): ChatRoom => ({
  chatRoomId: 5,
  roomType: 'DIRECT',
  status: 'ACTIVE',
  createdAt: '2026-10-14T10:00:00',
  members: [
    { userId: ME_ID, nickname: '하늘', active: true, participationVersion: 2 },
    {
      userId: PARTNER_ID,
      nickname: '편집하는 고래',
      active: partnerActive,
      participationVersion: 1,
    },
  ],
  ...patch,
})

let seq = 0
const message = (patch: Partial<ChatMessage> = {}): ChatMessage => {
  seq++
  return {
    messageId: 100 + seq,
    chatRoomId: 5,
    roomSequence: seq,
    senderUserId: PARTNER_ID,
    messageType: 'TEXT',
    content: `메시지 ${seq}`,
    sentAt: '2026-10-14T21:05:00',
    ...patch,
  }
}

function mockChat(
  rooms: ChatRoom[],
  messages: ChatMessage[] = [],
  nextCursor: number | null = null,
) {
  server.use(
    http.get('*/api/v1/chats', () => rs(rooms)),
    http.get('*/api/v1/chats/:roomId/messages', ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor')
      return cursor
        ? rs({
            messages: [message({ content: '오래된 메시지', roomSequence: 1 })],
            nextCursor: null,
          })
        : rs({ messages, nextCursor })
    }),
  )
}

/** 앱이 맺은 STOMP 연결을 연결된 상태로 만든다 */
async function connectSocket() {
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  return client
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
  seq = 0
})

describe('채팅', () => {
  it('인플루언서 프로필에서 채팅을 시작하면 대화로 가서 이력을 오래된 순으로 보여 준다', async () => {
    let target: unknown
    server.use(
      http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
        rs({
          id: PARTNER_ID,
          nickname: '편집하는 고래',
          role: 'INFLUENCER',
          profileImageUrl: null,
          channels: [],
        }),
      ),
      http.post('*/api/v1/chats', async ({ request }) => {
        target = await request.json()
        return rs(room(), 201)
      }),
    )
    // 이력은 최신순으로 온다
    mockChat(
      [room()],
      [message({ content: '두 번째' }), message({ content: '첫 번째' })],
    )
    document.cookie = 'XSRF-TOKEN=t'
    const router = renderApp(`/influencers/${PARTNER_ID}`, 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '채팅으로 일정 맞추기' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/5'))
    const thread = await screen.findByRole('region', {
      name: '편집하는 고래 님과의 대화',
    })
    const bubbles = await within(thread).findAllByText(/번째/)
    expect(bubbles.map((b) => b.textContent)).toEqual(['첫 번째', '두 번째'])
    expect(target).toEqual({ targetUserId: PARTNER_ID })
  })

  it('보낸 메시지는 STOMP로 나가고 서버가 돌려준 메시지가 대화에 붙는다', async () => {
    mockChat([room()])
    renderApp('/chat/5', 'INFLUENCER')
    const input = await screen.findByRole('textbox', { name: '메시지' })
    // 연결 전에는 보낼 수 없다
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()

    const client = await connectSocket()
    await userEvent.type(input, '안녕하세요')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(client.published).toEqual([
      {
        destination: '/pub/chats/5/messages',
        body: JSON.stringify({ content: '안녕하세요' }),
      },
    ])
    expect(input).toHaveValue('')
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ senderUserId: ME_ID, content: '안녕하세요' }),
      ),
    )
    expect(await screen.findByText('안녕하세요')).toBeInTheDocument()
  })

  it('다른 방의 새 메시지 알림은 안 읽은 수로 세고, 보고 있는 방은 세지 않는다', async () => {
    mockChat([room(), room({ chatRoomId: 6 })])
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()

    const notify = (chatRoomId: number) =>
      act(() =>
        client.push('/user/queue/chats/notifications', {
          type: 'NEW_MESSAGE',
          chatRoomId,
          messageId: 999,
          senderUserId: PARTNER_ID,
          sentAt: '2026-10-14T21:05:00',
        }),
      )
    notify(5)
    notify(6)
    notify(6)

    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByLabelText('안 읽은 메시지 2개')).toBeInTheDocument()
    const rooms = screen.getByRole('navigation', { name: '대화 목록' })
    expect(
      within(rooms).getByLabelText('안 읽은 메시지 2개'),
    ).toBeInTheDocument()
    expect(useChatStore.getState().unread).toEqual({ 6: 2 })
  })

  it('상대가 나간 방은 보내기 대신 다시 시작을 보여 주고, 다시 시작하면 이력을 새로 불러온다', async () => {
    let messageCalls = 0
    server.use(
      http.get('*/api/v1/chats', () => rs([room({}, false)])),
      http.get('*/api/v1/chats/5/messages', () => {
        messageCalls++
        return rs({
          messages: [
            message({
              messageType: 'SYSTEM',
              content: '편집하는 고래님이 나갔습니다.',
            }),
          ],
          nextCursor: null,
        })
      }),
      http.post('*/api/v1/chats', () => rs(room(), 200)),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/chat/5', 'INFLUENCER')

    expect(
      await screen.findByText('편집하는 고래님이 나갔습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '메시지' })).toBeNull()
    await userEvent.click(
      screen.getByRole('button', { name: '채팅 다시 시작' }),
    )
    await waitFor(() => expect(messageCalls).toBe(2))
  })

  it('나가기를 확인하면 참여 세대와 함께 나가고 대화 목록으로 돌아간다', async () => {
    let query: string | undefined
    mockChat([room()])
    server.use(
      http.delete('*/api/v1/chats/5/members/me', ({ request }) => {
        query = new URL(request.url).search
        return new HttpResponse(null, { status: 204 })
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    const router = renderApp('/chat/5', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '나가기' }))
    expect(
      screen.getByText('나가면 이 대화 기록을 다시 볼 수 없어요.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '나가기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
    expect(query).toBe('?participationVersion=2')
    expect(await screen.findByText('채팅방에서 나갔어요.')).toBeInTheDocument()
  })

  it('이전 메시지를 cursor로 더 불러온다', async () => {
    mockChat(
      [room()],
      [message({ content: '최근 메시지', roomSequence: 31 })],
      31,
    )
    renderApp('/chat/5', 'INFLUENCER')
    await userEvent.click(
      await screen.findByRole('button', { name: '이전 메시지 더 보기' }),
    )
    expect(await screen.findByText('오래된 메시지')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '이전 메시지 더 보기' }),
    ).toBeNull()
  })

  it('보내기 오류(상대 나감)는 안내하고 방 상태를 다시 불러온다', async () => {
    let roomCalls = 0
    server.use(
      http.get('*/api/v1/chats', () => {
        roomCalls++
        return rs([room()])
      }),
      http.get('*/api/v1/chats/5/messages', () =>
        rs({ messages: [], nextCursor: null }),
      ),
    )
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()
    act(() =>
      client.push('/user/queue/chats/errors', {
        code: 'CHAT_PARTNER_LEFT',
        message: '상대가 나간 채팅방에는 메시지를 보낼 수 없습니다.',
      }),
    )
    expect(
      await screen.findByText(
        '상대가 나간 채팅방에는 메시지를 보낼 수 없습니다.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(roomCalls).toBe(2))
  })

  it('연결이 끊겼다가 다시 연결되면 놓친 메시지를 채우려고 이력을 다시 불러온다', async () => {
    let messageCalls = 0
    server.use(
      http.get('*/api/v1/chats', () => rs([room()])),
      http.get('*/api/v1/chats/5/messages', () => {
        messageCalls++
        return rs({ messages: [], nextCursor: null })
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()
    await waitFor(() => expect(messageCalls).toBe(1))

    act(() => client.disconnect())
    expect(useChatStore.getState().status).toBe('disconnected')
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    act(() => client.connect())
    await waitFor(() => expect(messageCalls).toBe(2))
  })

  it('유저는 채팅 연결을 맺지 않는다', async () => {
    server.use(
      http.get('*/api/v1/lectures', () =>
        rs({
          content: [],
          page: { size: 12, number: 0, totalElements: 0, totalPages: 0 },
        }),
      ),
    )
    renderApp('/lectures', 'USER')
    await screen.findByRole('heading', { name: '강의' })
    expect(FakeStompClient.instances).toHaveLength(0)
  })
})
