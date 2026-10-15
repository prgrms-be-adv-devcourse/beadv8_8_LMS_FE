import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import { useChatStore } from '@/features/chat/chatStore'
import { READ_RETRY_DELAY_MS } from '@/features/chat/useChatUnread'
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
  // 연결되면 구독 전에 놓친 메시지를 채우려고 채팅 데이터를 다시 부른다. 끝날 때까지 기다린다.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
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
      [
        message({ content: '두 번째', roomSequence: 2 }),
        message({ content: '첫 번째', roomSequence: 1 }),
      ],
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

  it('보내기 오류는 그 메시지를 실패로 표시하고 같은 임시 ID로 다시 보낼 수 있다', async () => {
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
    // 같은 임시 ID로 다시 보낸다(저장됐는데 응답만 놓쳤어도 서버가 두 번 저장하지 않는다).
    expect(retried.clientMessageId).toBe(clientMessageId)
    expect(await screen.findByText('보내는 중…')).toBeInTheDocument()
  })

  it('끊긴 사이 저장됐지만 응답을 놓친 메시지는 다시 연결된 뒤 이력에서 찾아 성공으로 정리한다', async () => {
    let saved: ChatMessage | null = null
    mockChat([room()])
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({ messages: saved ? [saved] : [], nextCursor: null }),
      ),
    )
    renderApp('/chat/5', 'INFLUENCER')
    const input = await screen.findByRole('textbox', { name: '메시지' })
    const client = await connectSocket()
    await userEvent.type(input, '저장은 됐어요')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    const { clientMessageId } = JSON.parse(client.published[0].body)

    // 서버는 저장했지만 돌려주기 전에 연결이 끊겼다.
    saved = message({
      senderUserId: ME_ID,
      content: '저장은 됐어요',
      roomSequence: 1,
      clientMessageId,
    })
    act(() => client.disconnect())
    const thread = screen.getByRole('region', { name: /님과의 대화/ })
    expect(await within(thread).findByRole('alert')).toBeInTheDocument()

    // 다시 연결되면 이력을 다시 불러오고, 내 메시지의 임시 ID로 실패 표시를 지운다.
    act(() => client.connect())
    await waitFor(() => expect(within(thread).queryByRole('alert')).toBeNull())
    expect(within(thread).getAllByText('저장은 됐어요')).toHaveLength(1)
    expect(client.published).toHaveLength(1)
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

  it('상대가 나간 방은 다시 시작 버튼 없이 안내만 보이고, 재입장 안내가 오면 바로 대화가 이어진다', async () => {
    let partnerActive = false
    let roomCalls = 0
    mockChat(
      [room({}, false)],
      [
        message({
          messageType: 'SYSTEM',
          content: '편집하는 고래님이 나갔습니다.',
        }),
      ],
    )
    server.use(
      http.get('*/api/v1/chats', () => {
        roomCalls++
        return rs([room({}, partnerActive)])
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')

    expect(
      await screen.findByText(/상대가 다시 채팅을 시작하면 이어서 대화할 수/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '채팅 다시 시작' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '메시지' })).toBeNull()
    const client = await connectSocket()
    const callsBefore = roomCalls

    // 상대가 다시 채팅을 시작하면 BE가 남은 회원에게 재입장 안내(SYSTEM)를 보낸다.
    partnerActive = true
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({
          messageType: 'SYSTEM',
          content: '편집하는 고래님이 다시 들어왔습니다.',
          roomSequence: 10,
        }),
      ),
    )
    expect(
      await screen.findByText('편집하는 고래님이 다시 들어왔습니다.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('textbox', { name: '메시지' }),
    ).toBeInTheDocument()
    // 재입장 안내를 받았을 때만 방 상태를 다시 불렀다(주기적으로 확인하지 않는다).
    expect(roomCalls).toBe(callsBefore + 1)
  })

  it('나갔던 상대가 다시 들어와 메시지를 보내면 버튼을 누르지 않아도 바로 대화가 이어진다', async () => {
    let partnerActive = false
    mockChat([room({}, false)])
    server.use(http.get('*/api/v1/chats', () => rs([room({}, partnerActive)])))
    renderApp('/chat/5', 'INFLUENCER')
    expect(
      await screen.findByText(/상대가 다시 채팅을 시작하면 이어서 대화할 수/),
    ).toBeInTheDocument()
    const client = await connectSocket()

    partnerActive = true
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '다시 왔어요', roomSequence: 9 }),
      ),
    )
    expect(await screen.findByText('다시 왔어요')).toBeInTheDocument()
    expect(
      await screen.findByRole('textbox', { name: '메시지' }),
    ).toBeInTheDocument()
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
    const before = roomCalls
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
    await waitFor(() => expect(roomCalls).toBe(before + 1))
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
    // 방을 열 때 1번, 최초 연결 뒤 구독 전 구간을 메우려고 1번
    expect(messageCalls).toBe(2)

    act(() => client.disconnect())
    expect(useChatStore.getState().status).toBe('disconnected')
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    act(() => client.connect())
    await waitFor(() => expect(messageCalls).toBe(3))
  })

  it('관리자는 인플루언서 프로필에서 채팅을 시작한다(출연 요청은 보이지 않는다)', async () => {
    let target: unknown
    server.use(
      http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
        rs({
          id: PARTNER_ID,
          nickname: '편집하는 고래',
          role: 'VERIFIED_INFLUENCER',
          profileImageUrl: null,
          channels: [],
        }),
      ),
      http.post('*/api/v1/chats', async ({ request }) => {
        target = await request.json()
        return rs(room(), 201)
      }),
    )
    mockChat([room()])
    const router = renderApp(`/influencers/${PARTNER_ID}`, 'ADMIN')

    const start = await screen.findByRole('button', { name: '채팅 시작' })
    expect(
      screen.queryByRole('button', { name: '출연 요청 보내기' }),
    ).toBeNull()
    await userEvent.click(start)
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/5'))
    expect(target).toEqual({ targetUserId: PARTNER_ID })
  })

  it('관리자 채팅이 비어 있으면 인플루언서 목록으로 안내한다', async () => {
    mockChat([])
    renderApp('/chat', 'ADMIN')
    expect(
      await screen.findByText(/인플루언서 이상 회원과 1:1로 대화해요/),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: '인플루언서 찾기' }),
    ).toHaveAttribute('href', '/influencers')
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

describe('출연 알림', () => {
  const requestNotice = (patch: Partial<ChatMessage> = {}) =>
    message({
      messageType: 'NOTIFICATION',
      senderUserId: PARTNER_ID,
      content:
        '편집하는 고래님이 출연을 요청했습니다.\n제목: 주말 합방\n출연료: 30,000 HP',
      notificationKind: 'APPEARANCE_REQUEST_SENT',
      referenceId: 30,
      parentReferenceId: null,
      ...patch,
    })

  it('알림은 카드로 보여 주고 요청서로 이동하며, 방 목록에는 첫 줄만 보인다', async () => {
    const notice = requestNotice()
    mockChat([room({ lastMessage: notice, unreadCount: 1 })], [notice])
    renderApp('/chat/5', 'INFLUENCER')

    const card = await screen.findByRole('article', { name: '출연 알림' })
    expect(
      within(card).getByText('편집하는 고래님이 출연을 요청했습니다.'),
    ).toBeInTheDocument()
    expect(
      within(card).getByText(/제목: 주말 합방\s+출연료: 30,000 HP/),
    ).toBeInTheDocument()
    expect(
      within(card).getByRole('link', { name: '요청서 보기' }),
    ).toHaveAttribute('href', '/appearances/requests/30')
    const list = screen.getByRole('navigation', { name: '대화 목록' })
    expect(
      within(list).getByText('편집하는 고래님이 출연을 요청했습니다.'),
    ).toBeInTheDocument()
    expect(within(list).queryByText(/제목: 주말 합방/)).toBeNull()
  })

  it('모집 지원 알림은 모집글로 이동하고, 모집글 ID가 없던 옛 알림은 링크가 없다', async () => {
    mockChat(
      [room()],
      [
        message({
          messageType: 'NOTIFICATION',
          content:
            '편집하는 고래님이 출연 모집에 지원했습니다.\n모집글: 새 지원',
          notificationKind: 'APPEARANCE_APPLICATION_SUBMITTED',
          referenceId: 4,
          parentReferenceId: 7,
          roomSequence: 2,
        }),
        message({
          messageType: 'NOTIFICATION',
          content:
            '편집하는 고래님이 출연 모집에 지원했습니다.\n모집글: 옛 지원',
          notificationKind: 'APPEARANCE_APPLICATION_SUBMITTED',
          referenceId: 3,
          parentReferenceId: null,
          roomSequence: 1,
        }),
      ],
    )
    renderApp('/chat/5', 'INFLUENCER')

    const cards = await screen.findAllByRole('article', { name: '출연 알림' })
    // 이력은 최신순으로 오므로 화면에서는 옛 알림이 먼저다.
    expect(within(cards[0]).getByText('모집글: 옛 지원')).toBeInTheDocument()
    expect(within(cards[0]).queryByRole('link')).toBeNull()
    expect(
      within(cards[1]).getByRole('link', { name: '모집글 보기' }),
    ).toHaveAttribute('href', '/recruits/7')
  })

  it('알림을 받으면 방 목록을 다시 불러온다(받는 사람 재입장·새 방)', async () => {
    let roomCalls = 0
    mockChat([room()], [])
    server.use(
      http.get('*/api/v1/chats', () => {
        roomCalls++
        return rs([room()])
      }),
    )
    renderApp('/chat', 'INFLUENCER')
    const client = await connectSocket()
    await waitFor(() => expect(roomCalls).toBeGreaterThan(0))
    const before = roomCalls

    act(() =>
      client.push(
        '/user/queue/chats/messages',
        requestNotice({ roomSequence: 3 }),
      ),
    )
    await waitFor(() => expect(roomCalls).toBe(before + 1))
  })
})

describe('누락 방지 (구독과 조회 사이)', () => {
  /** 응답을 테스트가 정할 때까지 붙잡아 두는 핸들러용 */
  function deferred() {
    let release!: () => void
    const wait = new Promise<void>((r) => (release = r))
    return { wait, release }
  }

  it('이력을 불러오는 중에 도착한 메시지는 조회 결과에 빠져도 화면에 남는다', async () => {
    mockChat([room()])
    const gate = deferred()
    let messageCalls = 0
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        messageCalls++
        // 연결 직후 다시 부르는 조회만 붙잡는다(그 사이 도착한 메시지가 응답에 없다).
        if (messageCalls === 2) await gate.wait
        return rs({
          messages: [message({ content: '조회 결과', roomSequence: 1 })],
          nextCursor: null,
        })
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    expect(await screen.findByText('조회 결과')).toBeInTheDocument()
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    const client = FakeStompClient.latest()!
    act(() => client.connect())
    await waitFor(() => expect(messageCalls).toBe(2))

    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '조회 중 도착', roomSequence: 2 }),
      ),
    )
    gate.release()

    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    // 방 목록 미리보기에도 보이므로 대화 안에서 찾는다. 같은 메시지가 두 번 붙지 않는다.
    const thread = screen.getByRole('region', { name: /님과의 대화/ })
    expect(within(thread).getAllByText('조회 중 도착')).toHaveLength(1)
  })

  it('최초 연결에서도 구독한 뒤 이력을 다시 불러와, 연결 전에 온 메시지를 채운다', async () => {
    mockChat([room()])
    let connected = false
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({
          messages: connected
            ? [
                message({ content: '연결 전 도착', roomSequence: 2 }),
                message({ content: '처음 메시지', roomSequence: 1 }),
              ]
            : [message({ content: '처음 메시지', roomSequence: 1 })],
          nextCursor: null,
        }),
      ),
    )
    renderApp('/chat/5', 'INFLUENCER')
    expect(await screen.findByText('처음 메시지')).toBeInTheDocument()
    expect(screen.queryByText('연결 전 도착')).toBeNull()

    connected = true
    await connectSocket()
    expect(await screen.findByText('연결 전 도착')).toBeInTheDocument()
  })

  it('방 목록을 다시 부르는 중에 온 메시지는 안 읽은 수에 남고, 응답에 이미 있으면 두 번 세지 않는다', async () => {
    const latest = message({ chatRoomId: 6, roomSequence: 4 })
    const gate = deferred()
    let roomCalls = 0
    let includeLatest = false
    mockChat([])
    server.use(
      http.get('*/api/v1/chats', async () => {
        roomCalls++
        if (roomCalls === 2) await gate.wait
        return rs([
          room(),
          room({
            chatRoomId: 6,
            unreadCount: includeLatest ? 1 : 0,
            lastMessage: includeLatest ? latest : null,
          }),
        ])
      }),
    )
    renderApp('/chat', 'INFLUENCER')
    await screen.findByRole('navigation', { name: '대화 목록' })
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    const client = FakeStompClient.latest()!
    act(() => client.connect())
    await waitFor(() => expect(roomCalls).toBe(2))

    // 연결 직후 방 목록 조회 중에 도착 → 응답(도착 전 상태)에 덮이지 않는다.
    act(() => client.push('/user/queue/chats/messages', latest))
    gate.release()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(within(nav).getByLabelText('안 읽은 메시지 1개')).toBeInTheDocument()

    // 다시 불러온 응답에 이미 반영돼 있으면 그대로 둔다(1개).
    includeLatest = true
    await act(() =>
      queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }),
    )
    expect(within(nav).getByLabelText('안 읽은 메시지 1개')).toBeInTheDocument()
  })
})

describe('역순·중복 수신', () => {
  it('늦게 도착한 이전 메시지도 순번 순서대로 그린다', async () => {
    mockChat([room()], [message({ content: '하나', roomSequence: 1 })])
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await within(thread).findByText('하나')
    const client = await connectSocket()

    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '셋', roomSequence: 3 }),
      ),
    )
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '둘', roomSequence: 2 }),
      ),
    )

    await within(thread).findByText('둘')
    const bubbles = within(thread)
      .getAllByText(/^(하나|둘|셋)$/)
      .map((b) => b.textContent)
    expect(bubbles).toEqual(['하나', '둘', '셋'])
  })

  it('같은 메시지를 두 번 받아도 대화와 안 읽은 수에 한 번만 반영한다', async () => {
    mockChat(
      [room(), room({ chatRoomId: 6, unreadCount: 0 })],
      [message({ content: '보는 방', roomSequence: 1 })],
    )
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await within(thread).findByText('보는 방')
    const client = await connectSocket()

    const here = message({ content: '두 번 온 메시지', roomSequence: 2 })
    const other = message({ chatRoomId: 6, roomSequence: 4 })
    act(() => {
      client.push('/user/queue/chats/messages', here)
      client.push('/user/queue/chats/messages', here)
      client.push('/user/queue/chats/messages', other)
      client.push('/user/queue/chats/messages', other)
    })

    expect(await within(thread).findAllByText('두 번 온 메시지')).toHaveLength(
      1,
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByLabelText('안 읽은 메시지 1개')).toBeInTheDocument()
  })
})

describe('읽음 처리', () => {
  afterEach(() => vi.useRealTimers())

  it('읽음 요청이 실패하면 안 읽은 수를 되돌리고 잠시 뒤 다시 보낸다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockChat(
      [room({ unreadCount: 2 })],
      [message({ content: '읽을 메시지', roomSequence: 7 })],
    )
    const bodies: unknown[] = []
    server.use(
      http.put('*/api/v1/chats/:chatRoomId/read', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? HttpResponse.json(
              { status: 500, code: 'INTERNAL_ERROR', detail: '잠시 실패' },
              { status: 500 },
            )
          : new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByText('읽을 메시지')
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })

    // 실패 → 지웠던 안 읽은 수가 돌아온다(안내는 띄우지 않는다).
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(
      await within(nav).findByLabelText('안 읽은 메시지 2개'),
    ).toBeInTheDocument()
    expect(screen.queryByText('잠시 실패')).toBeNull()

    // 잠시 뒤 같은 순번으로 다시 보내고, 성공하면 안 읽은 수를 지운다.
    await act(() => vi.advanceTimersByTimeAsync(READ_RETRY_DELAY_MS))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ lastReadSequence: 7 })
    await waitFor(() =>
      expect(within(nav).queryByLabelText(/안 읽은 메시지/)).toBeNull(),
    )
  })

  it('가려진 동안 이미 읽은 순번의 이전 메시지가 늦게 와도, 다시 보면 안 읽은 수가 남지 않는다', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus')
    mockChat([room()], [message({ content: '읽은 메시지', roomSequence: 7 })])
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByText('읽은 메시지')
    await waitFor(() =>
      expect(reads).toEqual([
        { chatRoomId: '5', body: { lastReadSequence: 7 } },
      ]),
    )
    const client = await connectSocket()

    hasFocus.mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    // 역순 전달로 순번 6이 늦게 왔다(서버는 7까지 읽음 처리함).
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '늦게 온 이전 메시지', roomSequence: 6 }),
      ),
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(
      await within(nav).findByLabelText('안 읽은 메시지 1개'),
    ).toBeInTheDocument()

    hasFocus.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() =>
      expect(within(nav).queryByLabelText(/안 읽은 메시지/)).toBeNull(),
    )
    expect(reads).toHaveLength(1)
  })

  it('탭이 가려져 있으면 읽음 처리를 미루고, 그사이 온 메시지는 안 읽은 수로 센다', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    mockChat(
      [room({ unreadCount: 1 })],
      [message({ content: '안 본 메시지', roomSequence: 3 })],
    )
    renderApp('/chat/5', 'INFLUENCER')
    await screen.findByText('안 본 메시지')
    const client = await connectSocket()
    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '가려진 동안', roomSequence: 4 }),
      ),
    )
    await screen.findAllByText('가려진 동안')
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByLabelText('안 읽은 메시지 2개')).toBeInTheDocument()
    expect(reads).toEqual([])

    // 다시 보면(포커스) 마지막 순번까지 읽음 처리한다.
    hasFocus.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() =>
      expect(reads).toEqual([
        { chatRoomId: '5', body: { lastReadSequence: 4 } },
      ]),
    )
    expect(within(nav).queryByLabelText(/안 읽은 메시지/)).toBeNull()
  })
})

describe('다시 불러오기 실패 시 보이던 화면 유지', () => {
  const failure = () =>
    HttpResponse.json(
      { status: 400, code: 'INVALID_REQUEST', detail: '잠시 실패했어요.' },
      { status: 400 },
    )

  it('이전 메시지를 못 불러와도 대화를 두고 안내하며, 다시 시도하면 이어 붙인다', async () => {
    let failOlder = true
    mockChat([room()])
    server.use(
      http.get('*/api/v1/chats/5/messages', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor)
          return rs({
            messages: [message({ content: '최근 메시지', roomSequence: 2 })],
            nextCursor: 2,
          })
        if (failOlder) return failure()
        return rs({
          messages: [message({ content: '오래된 메시지', roomSequence: 1 })],
          nextCursor: null,
        })
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await within(thread).findByText('최근 메시지')

    await userEvent.click(
      within(thread).getByRole('button', { name: '이전 메시지 더 보기' }),
    )
    const alert = await within(thread).findByRole('alert')
    expect(alert).toHaveTextContent('이전 메시지를 불러오지 못했어요.')
    expect(within(thread).getByText('최근 메시지')).toBeInTheDocument()

    failOlder = false
    await userEvent.click(
      within(alert).getByRole('button', { name: '다시 시도' }),
    )
    expect(await within(thread).findByText('오래된 메시지')).toBeInTheDocument()
    expect(within(thread).getByText('최근 메시지')).toBeInTheDocument()
    expect(within(thread).queryByRole('alert')).toBeNull()
  })

  it('재연결 때 이력을 다시 불러오지 못해도 보이던 대화를 둔다', async () => {
    let failHistory = false
    mockChat([room()])
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        failHistory
          ? failure()
          : rs({
              messages: [message({ content: '보이던 대화', roomSequence: 1 })],
              nextCursor: null,
            }),
      ),
    )
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await within(thread).findByText('보이던 대화')
    const client = await connectSocket()

    failHistory = true
    act(() => client.disconnect())
    act(() => client.connect())

    expect(await within(thread).findByRole('alert')).toHaveTextContent(
      '대화를 새로 불러오지 못했어요.',
    )
    expect(within(thread).getByText('보이던 대화')).toBeInTheDocument()
    expect(
      within(thread).getByRole('textbox', { name: '메시지' }),
    ).toBeInTheDocument()
  })

  it('방 목록을 다시 불러오지 못해도 목록을 두고 위에서 안내한다', async () => {
    let failRooms = false
    mockChat([room()])
    server.use(
      http.get('*/api/v1/chats', () => (failRooms ? failure() : rs([room()]))),
    )
    renderApp('/chat', 'INFLUENCER')
    const list = await screen.findByRole('navigation', { name: '대화 목록' })
    expect(within(list).getByText('편집하는 고래')).toBeInTheDocument()

    failRooms = true
    await act(() =>
      queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '대화 목록을 새로 불러오지 못했어요.',
    )
    expect(
      within(screen.getByRole('navigation', { name: '대화 목록' })).getByText(
        '편집하는 고래',
      ),
    ).toBeInTheDocument()

    failRooms = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('이전 메시지 조회 실패 뒤 스크롤', () => {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight',
  )
  afterEach(() => {
    if (original)
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
  })

  it('이전 메시지를 못 불러온 뒤 새 메시지가 오면 맨 아래로 내려간다', async () => {
    // jsdom은 레이아웃이 없어 scrollHeight가 0이다. 자식 수에 비례하게 흉내 낸다.
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.childElementCount * 100
      },
    })
    mockChat([room()])
    server.use(
      http.get('*/api/v1/chats/5/messages', ({ request }) =>
        new URL(request.url).searchParams.get('cursor')
          ? HttpResponse.json(
              { status: 400, code: 'INVALID_REQUEST', detail: '실패' },
              { status: 400 },
            )
          : rs({
              messages: [message({ content: '최근 메시지', roomSequence: 2 })],
              nextCursor: 2,
            }),
      ),
    )
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await within(thread).findByText('최근 메시지')
    const client = await connectSocket()
    const box = thread.querySelector('[aria-live="polite"]') as HTMLElement

    // 위로 올려 이전 메시지를 부르다 실패한다.
    box.scrollTop = 0
    await userEvent.click(
      within(thread).getByRole('button', { name: '이전 메시지 더 보기' }),
    )
    await within(thread).findByRole('alert')

    act(() =>
      client.push(
        '/user/queue/chats/messages',
        message({ content: '새로 온 메시지', roomSequence: 3 }),
      ),
    )
    await within(thread).findByText('새로 온 메시지')
    expect(box.scrollTop).toBe(box.scrollHeight)
  })
})
