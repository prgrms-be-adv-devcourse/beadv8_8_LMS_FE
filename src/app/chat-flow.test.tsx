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

/** 읽음 처리 요청을 기록한다 */
const reads: { chatRoomId: string; body: unknown }[] = []
const readHandler = http.put(
  '*/api/v1/chats/:chatRoomId/read',
  async ({ params, request }) => {
    reads.push({
      chatRoomId: String(params.chatRoomId),
      body: await request.json(),
    })
    return new HttpResponse(null, { status: 204 })
  },
)

function mockChat(
  rooms: ChatRoom[],
  messages: ChatMessage[] = [],
  nextCursor: number | null = null,
) {
  // 읽음 처리(PUT) 전에 CSRF 토큰을 받으러 내 정보를 부르지 않게 한다.
  document.cookie = 'XSRF-TOKEN=t'
  server.use(
    readHandler,
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
  reads.length = 0
  useChatStore.setState({ pending: {} })
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

  it('보낸 메시지는 보내는 중으로 보이다가 같은 임시 ID의 메시지가 오면 대화에 붙는다', async () => {
    mockChat([room()])
    renderApp('/chat/5', 'INFLUENCER')
    const input = await screen.findByRole('textbox', { name: '메시지' })
    // 연결 전에는 보낼 수 없다
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()

    const client = await connectSocket()
    await userEvent.type(input, '안녕하세요')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(client.published).toHaveLength(1)
    expect(client.published[0].destination).toBe('/pub/chats/5/messages')
    const body = JSON.parse(client.published[0].body)
    expect(body).toEqual({
      content: '안녕하세요',
      clientMessageId: expect.any(String),
    })
    expect(input).toHaveValue('')
    expect(await screen.findByText('보내는 중…')).toBeInTheDocument()

    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({
          senderUserId: ME_ID,
          content: '안녕하세요',
          clientMessageId: body.clientMessageId,
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByText('보내는 중…')).toBeNull())
    expect(screen.getAllByText('안녕하세요')).toHaveLength(1)
  })

  it('보내기 오류는 그 메시지를 실패로 표시하고 다시 보낼 수 있다', async () => {
    mockChat([room()])
    renderApp('/chat/5', 'INFLUENCER')
    const input = await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()
    await userEvent.type(input, '실패할 메시지')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    const { clientMessageId } = JSON.parse(client.published[0].body)

    act(() =>
      client.push('/user/queue/chats/errors', {
        code: 'INVALID_REQUEST',
        message: '메시지 내용이 비어 있습니다.',
        clientMessageId,
      }),
    )
    const thread = screen.getByRole('region', {
      name: '편집하는 고래 님과의 대화',
    })
    expect(await within(thread).findByRole('alert')).toHaveTextContent(
      '메시지 내용이 비어 있습니다.',
    )
    await userEvent.click(
      within(thread).getByRole('button', { name: '다시 보내기' }),
    )

    expect(client.published).toHaveLength(2)
    const retried = JSON.parse(client.published[1].body)
    expect(retried.content).toBe('실패할 메시지')
    expect(retried.clientMessageId).not.toBe(clientMessageId)
    expect(await screen.findByText('보내는 중…')).toBeInTheDocument()
  })

  it('연결이 끊기면 보내는 중이던 메시지를 실패로 바꾼다', async () => {
    mockChat([room()])
    renderApp('/chat/5', 'INFLUENCER')
    const input = await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()
    await userEvent.type(input, '끊기기 직전')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    act(() => client.disconnect())
    expect(
      await screen.findByText(/연결이 끊겨 전송 여부를 확인하지 못했어요/),
    ).toBeInTheDocument()
  })

  it('임시 ID 없이 돌아온 내 메시지(이전 BE)도 같은 내용의 보내는 중 표시를 지운다', async () => {
    mockChat([room()])
    renderApp('/chat/5', 'INFLUENCER')
    const input = await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()
    await userEvent.type(input, '옛 서버')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ senderUserId: ME_ID, content: '옛 서버' }),
      ),
    )
    await waitFor(() => expect(screen.queryByText('보내는 중…')).toBeNull())
  })

  it('방 목록은 마지막 메시지 순으로 정렬하고 서버의 안 읽은 수를 보여 준다', async () => {
    mockChat([
      room({
        chatRoomId: 6,
        createdAt: '2026-10-14T09:00:00',
        unreadCount: 0,
        lastMessage: message({
          chatRoomId: 6,
          content: '오래된 대화',
          sentAt: '2026-10-14T09:10:00',
        }),
      }),
      room({
        chatRoomId: 7,
        createdAt: '2026-10-13T09:00:00',
        unreadCount: 3,
        lastMessage: message({
          chatRoomId: 7,
          content: '방금 온 메시지',
          sentAt: '2026-10-14T22:00:00',
        }),
      }),
    ])
    renderApp('/chat', 'INFLUENCER')

    const list = await screen.findByRole('navigation', { name: '대화 목록' })
    const links = await within(list).findAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('방금 온 메시지'),
      expect.stringContaining('오래된 대화'),
    ])
    expect(
      within(list).getByLabelText('안 읽은 메시지 3개'),
    ).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByLabelText('안 읽은 메시지 3개')).toBeInTheDocument()
  })

  it('방을 열면 마지막 순번까지 읽음 처리하고, 보는 중 받은 메시지도 읽음 처리한다', async () => {
    mockChat(
      [room({ unreadCount: 2 }), room({ chatRoomId: 6, unreadCount: 0 })],
      [message({ roomSequence: 12 }), message({ roomSequence: 11 })],
    )
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByRole('textbox', { name: '메시지' })
    await waitFor(() =>
      expect(reads).toEqual([
        { chatRoomId: '5', body: { lastReadSequence: 12 } },
      ]),
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).queryByLabelText(/안 읽은 메시지/)).toBeNull()

    const client = await connectSocket()
    // 보고 있는 방은 읽음 처리, 다른 방은 안 읽은 수가 오른다
    act(() =>
      client.push('/user/queue/chats/messages', message({ roomSequence: 13 })),
    )
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ chatRoomId: 6, roomSequence: 4 }),
      ),
    )
    await waitFor(() =>
      expect(reads.at(-1)).toEqual({
        chatRoomId: '5',
        body: { lastReadSequence: 13 },
      }),
    )
    expect(within(nav).getByLabelText('안 읽은 메시지 1개')).toBeInTheDocument()
  })

  it('읽음 처리에 실패해도 안내를 띄우지 않는다', async () => {
    mockChat(
      [room({ unreadCount: 1 })],
      [message({ roomSequence: 3, content: '읽을 메시지' })],
    )
    let readCalls = 0
    server.use(
      http.put('*/api/v1/chats/:chatRoomId/read', () => {
        readCalls++
        return HttpResponse.json(
          { status: 404, code: 'NOT_FOUND', detail: '없는 경로' },
          { status: 404 },
        )
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    expect(await screen.findByText('읽을 메시지')).toBeInTheDocument()
    await waitFor(() => expect(readCalls).toBe(1))
    expect(screen.queryByText('없는 경로')).toBeNull()
  })

  it('상대가 나간 방은 보내기 대신 다시 시작을 보여 주고, 다시 시작하면 이력을 새로 불러온다', async () => {
    let messageCalls = 0
    server.use(
      readHandler,
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

  it('닫기는 나가지 않고 방 목록으로 돌아가며, 이후 메시지는 안 읽은 수로 쌓인다', async () => {
    let leaves = 0
    mockChat([room({ unreadCount: 0 })])
    server.use(
      http.delete('*/api/v1/chats/:roomId/members/me', () => {
        leaves++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderApp('/chat/5', 'INFLUENCER')
    await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()

    await userEvent.click(screen.getByRole('link', { name: '대화 닫기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
    expect(leaves).toBe(0)

    // 닫은 방에 온 메시지는 보고 있는 방이 아니므로 안 읽은 수가 된다.
    act(() =>
      client.push('/user/queue/chats/messages', message({ roomSequence: 20 })),
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(
      await within(nav).findByLabelText('안 읽은 메시지 1개'),
    ).toBeInTheDocument()
    const rooms = screen.getByRole('navigation', { name: '대화 목록' })
    expect(
      within(rooms).getByLabelText('안 읽은 메시지 1개'),
    ).toBeInTheDocument()
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
      screen.getByText(
        /나가면 이 대화 기록을 다시 볼 수 없고 상대에게 퇴장 안내가 가요/,
      ),
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
      readHandler,
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
      readHandler,
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
