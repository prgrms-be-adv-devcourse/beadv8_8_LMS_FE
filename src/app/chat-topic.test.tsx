import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatKeys } from '@/entities/chat/api'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import { sendChatMessage, useChatStore } from '@/features/chat/chatStore'
import {
  CHAT_FRAME_TYPE_HEADER,
  PARTICIPATION_VERSION_HEADER,
  roomTopic,
} from '@/features/chat/receipt/contract'
import { RECEIPT_POLICY } from '@/features/chat/receipt/policy'
import { closeLoginModal } from '@/shared/ui/loginModal'
import {
  deliver,
  MY_MESSAGES,
  pushActivity,
  roomSubscription,
} from '@/test/chatServer'
import { FakeStompClient } from '@/test/fakeStomp'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PARTNERS: Record<number, { userId: number; nickname: string }> = {
  5: { userId: 8, nickname: '편집하는 고래' },
  6: { userId: 9, nickname: '노래하는 참새' },
}

const room = (
  chatRoomId: number,
  patch: Partial<ChatRoom> = {},
  myVersion = 2,
): ChatRoom => ({
  chatRoomId,
  roomType: 'DIRECT',
  status: 'ACTIVE',
  createdAt: '2026-10-14T10:00:00',
  members: [
    {
      userId: ME_ID,
      nickname: '하늘',
      active: true,
      participationVersion: myVersion,
    },
    { ...PARTNERS[chatRoomId], active: true, participationVersion: 1 },
  ],
  lastMessage: null,
  unreadCount: 0,
  ...patch,
})

const message = (
  chatRoomId: number,
  roomSequence: number,
  patch: Partial<ChatMessage> = {},
): ChatMessage => ({
  messageId: chatRoomId * 1000 + roomSequence,
  chatRoomId,
  roomSequence,
  senderUserId: PARTNERS[chatRoomId].userId,
  messageType: 'TEXT',
  content: `${chatRoomId}번 방 순번 ${roomSequence}`,
  sentAt: '2026-10-29T10:00:00',
  ...patch,
})

/** 내 참여 세대 2의 실시간 메타데이터 */
const V2 = { [PARTICIPATION_VERSION_HEADER]: '2' }

/**
 * 채팅 응답을 정한다. rooms()·history(방)가 그때의 서버 상태이고, 조회 수를 센다.
 * 읽음·수신 확인은 성공으로 답한다.
 */
function mockChat(
  rooms: () => ChatRoom[],
  history: (chatRoomId: number) => ChatMessage[] = () => [],
) {
  document.cookie = 'XSRF-TOKEN=t'
  const calls = { rooms: 0, history: {} as Record<number, number> }
  server.use(
    http.put(
      '*/api/v1/chats/:chatRoomId/read',
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.put(
      '*/api/v1/chats/:chatRoomId/received',
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get('*/api/v1/chats', () => {
      calls.rooms++
      return rs(rooms())
    }),
    http.get('*/api/v1/chats/:chatRoomId/messages', ({ params }) => {
      const id = Number(params.chatRoomId)
      calls.history[id] = (calls.history[id] ?? 0) + 1
      return rs({ messages: history(id), nextCursor: null })
    }),
  )
  return calls
}

async function connectSocket() {
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  await settle()
  return client
}

async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

/** 방 topic 구독으로 서버가 구독 거절·회수 프레임을 보낸다 */
function endSubscription(
  client: FakeStompClient,
  chatRoomId: number,
  type: 'SUBSCRIPTION_REJECTED' | 'SUBSCRIPTION_REVOKED',
  reason: string,
  extra: Record<string, unknown> = {},
) {
  const subscription = roomSubscription(client, chatRoomId)!
  act(() =>
    client.pushTo(
      subscription,
      { type, roomId: chatRoomId, reason, ...extra },
      { [CHAT_FRAME_TYPE_HEADER]: type },
    ),
  )
  return subscription
}

/** 이 방 topic에 한 구독(해제·끊긴 것 포함) */
const topicSubscriptions = (client: FakeStompClient, chatRoomId: number) =>
  client.subscriptions.filter((s) => s.destination === roomTopic(chatRoomId))

async function openRoom(chatRoomId: number, firstText: string) {
  renderApp(`/chat/${chatRoomId}`, 'INFLUENCER')
  const thread = await screen.findByRole('region', { name: /님과의 대화/ })
  await within(thread).findByText(firstText)
  const client = await connectSocket()
  return { thread, client }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  queryClient.clear()
  closeLoginModal()
  useChatStore.setState({ pending: {} })
})

describe('열어 둔 방의 방 topic 구독', () => {
  it('연 방만 내 참여 세대 헤더로 구독하고, 대화를 닫으면 해제하고 다른 방을 열면 그 방을 구독한다', async () => {
    mockChat(
      () => [room(5), room(6)],
      (id) => [message(id, 1)],
    )
    const { client } = await openRoom(5, '5번 방 순번 1')

    const [first] = topicSubscriptions(client, 5)
    expect(first.headers).toEqual({ [PARTICIPATION_VERSION_HEADER]: '2' })
    expect(topicSubscriptions(client, 6)).toEqual([])

    const list = screen.getByRole('navigation', { name: '대화 목록' })
    await userEvent.click(
      within(list).getByRole('link', { name: /노래하는 참새/ }),
    )
    await screen.findByText('6번 방 순번 1')
    expect(first.unsubscribed).toBe(true)
    expect(roomSubscription(client, 6)?.headers).toEqual(V2)

    await userEvent.click(screen.getByRole('link', { name: '대화 닫기' }))
    await waitFor(() => expect(roomSubscription(client, 6)).toBeUndefined())
    expect(topicSubscriptions(client, 6)[0].unsubscribed).toBe(true)
    await settle()
  })

  it('다시 연결되면 열어 둔 방을 새 구독으로 다시 구독하고, 끊긴 구독으로 늦게 온 프레임은 적용하지 않는다', async () => {
    mockChat(
      () => [room(5)],
      () => [message(5, 1)],
    )
    const { client, thread } = await openRoom(5, '5번 방 순번 1')
    const before = roomSubscription(client, 5)!

    act(() => client.disconnect())
    act(() => client.connect())
    await settle()

    const after = roomSubscription(client, 5)!
    expect(after.id).not.toBe(before.id)
    expect(after.headers).toEqual(V2)
    act(() =>
      before.callback({ body: JSON.stringify(message(5, 2)), headers: V2 }),
    )
    act(() => deliver(client, message(5, 3), V2))
    expect(await within(thread).findByText('5번 방 순번 3')).toBeInTheDocument()
    expect(within(thread).queryByText('5번 방 순번 2')).toBeNull()
    await settle()
  })

  it('방 목록을 받기 전에는 세대를 몰라 구독하지 않고, 나간 방은 구독하지 않는다', async () => {
    let me = true
    const left = room(5)
    left.members[0] = { ...left.members[0], active: false }
    mockChat(
      () => [me ? room(5) : left],
      () => [message(5, 1)],
    )
    const { client } = await openRoom(5, '5번 방 순번 1')
    expect(roomSubscription(client, 5)).toBeDefined()

    // 다른 탭에서 나갔다. 방 목록을 다시 받으면 구독을 푼다.
    me = false
    await act(() =>
      queryClient.invalidateQueries({ queryKey: chatKeys.rooms() }),
    )
    await settle()
    expect(roomSubscription(client, 5)).toBeUndefined()
  })

  it('내 메시지가 방 topic(이 세션)과 결과 큐 두 경로로 와도 한 번만 그리고 보내는 중 표시를 지운다', async () => {
    mockChat(
      () => [room(5)],
      () => [message(5, 1)],
    )
    const { client, thread } = await openRoom(5, '5번 방 순번 1')
    act(() => sendChatMessage(5, '두 경로'))
    const { clientMessageId } = JSON.parse(client.published[0].body)

    act(() =>
      deliver(
        client,
        message(5, 2, {
          senderUserId: ME_ID,
          content: '두 경로',
          clientMessageId,
        }),
        V2,
      ),
    )
    expect(await within(thread).findAllByText('두 경로')).toHaveLength(1)
    expect(useChatStore.getState().pending[5]).toBeUndefined()
    await settle()
  })

  it('방 topic으로 온 내 메시지에 임시 ID가 없으면(다른 기기에서 보냄) 같은 내용의 보내는 중 표시를 지우지 않는다', async () => {
    mockChat(
      () => [room(5)],
      () => [message(5, 1)],
    )
    const { client, thread } = await openRoom(5, '5번 방 순번 1')
    act(() => sendChatMessage(5, 'ㅋㅋ'))

    // 다른 기기에서 같은 내용을 보냈다(방 topic만 온다).
    act(() =>
      client.push(
        roomTopic(5),
        message(5, 2, { senderUserId: ME_ID, content: 'ㅋㅋ' }),
        V2,
      ),
    )
    await waitFor(() =>
      expect(within(thread).getAllByText('ㅋㅋ')).toHaveLength(2),
    )
    expect(useChatStore.getState().pending[5]?.[0]?.status).toBe('sending')
    await settle()
  })
})

describe('방 topic 구독 거절·회수', () => {
  it('회수되면 해제하고 그 구독으로 늦게 온 메시지는 적용하지 않으며, 방 목록과 이력을 다시 받는다', async () => {
    const calls = mockChat(
      () => [room(5)],
      () => [message(5, 1)],
    )
    const { client, thread } = await openRoom(5, '5번 방 순번 1')
    const before = { rooms: calls.rooms, history: calls.history[5] }

    const revoked = endSubscription(
      client,
      5,
      'SUBSCRIPTION_REVOKED',
      'REMOVED',
    )
    expect(revoked.unsubscribed).toBe(true)
    act(() =>
      revoked.callback({ body: JSON.stringify(message(5, 2)), headers: V2 }),
    )

    await waitFor(() => expect(calls.rooms).toBe(before.rooms + 1))
    await waitFor(() =>
      expect(calls.history[5]).toBeGreaterThan(before.history),
    )
    await settle()
    expect(within(thread).queryByText('5번 방 순번 2')).toBeNull()
    // 같은 세대로는 이 연결에서 다시 구독하지 않는다.
    expect(roomSubscription(client, 5)).toBeUndefined()
  })

  it('세대가 낡아 거절되고 서버가 현재 세대를 알려 주면 그 세대로 바로 다시 구독한다', async () => {
    let version = 2
    mockChat(
      () => [room(5, {}, version)],
      () => [message(5, 1)],
    )
    const { client } = await openRoom(5, '5번 방 순번 1')

    // 다른 탭에서 나갔다가 다시 들어와 세대가 3이 됐다.
    version = 3
    endSubscription(client, 5, 'SUBSCRIPTION_REJECTED', 'STALE_PARTICIPATION', {
      currentParticipationVersion: 3,
    })
    await waitFor(() =>
      expect(roomSubscription(client, 5)?.headers).toEqual({
        [PARTICIPATION_VERSION_HEADER]: '3',
      }),
    )
    await settle()
    expect(topicSubscriptions(client, 5)).toHaveLength(2)
  })

  it('참여 중이 아니라고 거절되면 같은 세대로 다시 구독하지 않고 방 목록과 이력을 다시 맞춘다', async () => {
    const calls = mockChat(
      () => [room(5)],
      () => [message(5, 1)],
    )
    const { client } = await openRoom(5, '5번 방 순번 1')
    const roomsBefore = calls.rooms

    endSubscription(client, 5, 'SUBSCRIPTION_REJECTED', 'NOT_MEMBER')
    await waitFor(() => expect(calls.rooms).toBe(roomsBefore + 1))
    await settle()
    expect(topicSubscriptions(client, 5)).toHaveLength(1)
    expect(roomSubscription(client, 5)).toBeUndefined()
  })

  it('서버가 바빠 거절하면 그동안 새 메시지 알림으로 이력을 맞추고, 잠시 뒤 한 번만 다시 구독한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let history = [message(5, 1)]
    const calls = mockChat(
      () => [room(5, { lastMessage: history[0] })],
      () => history,
    )
    const { client, thread } = await openRoom(5, '5번 방 순번 1')
    const { busyRetryMs } = RECEIPT_POLICY.subscription

    endSubscription(client, 5, 'SUBSCRIPTION_REJECTED', 'SERVER_BUSY')
    expect(roomSubscription(client, 5)).toBeUndefined()

    // 구독하지 않은 동안에는 서버가 새 메시지 알림을 보낸다. 열어 둔 방이면 이력을 다시 읽는다.
    const historyBefore = calls.history[5]
    history = [message(5, 2), message(5, 1)]
    act(() => deliver(client, message(5, 2), V2))
    expect(await within(thread).findByText('5번 방 순번 2')).toBeInTheDocument()
    expect(calls.history[5]).toBeGreaterThan(historyBefore)
    await settle()

    await act(() => vi.advanceTimersByTimeAsync(busyRetryMs))
    expect(roomSubscription(client, 5)).toBeDefined()

    // 다시 바쁘면 이 연결에서는 더 구독하지 않는다.
    endSubscription(client, 5, 'SUBSCRIPTION_REJECTED', 'SERVER_BUSY')
    await act(() => vi.advanceTimersByTimeAsync(busyRetryMs * 2))
    expect(topicSubscriptions(client, 5)).toHaveLength(2)
    await settle()
  })

  it('모르는 프레임 종류·사유는 재동기화한다', async () => {
    const calls = mockChat(
      () => [room(5)],
      () => [message(5, 1)],
    )
    const { client } = await openRoom(5, '5번 방 순번 1')
    const roomsBefore = calls.rooms

    act(() =>
      client.pushTo(
        roomSubscription(client, 5)!,
        { type: 'SOMETHING_NEW' },
        { [CHAT_FRAME_TYPE_HEADER]: 'SOMETHING_NEW' },
      ),
    )
    await waitFor(() => expect(calls.rooms).toBe(roomsBefore + 1))
    await settle()

    endSubscription(client, 5, 'SUBSCRIPTION_REVOKED', 'SOME_REASON')
    await waitFor(() => expect(calls.rooms).toBe(roomsBefore + 2))
    await settle()
  })
})

describe('열지 않은 방의 새 메시지 알림', () => {
  async function openList(initial: ChatRoom[]) {
    let rooms = initial
    const calls = mockChat(() => rooms)
    renderApp('/chat', 'INFLUENCER')
    const list = await screen.findByRole('navigation', { name: '대화 목록' })
    const client = await connectSocket()
    return {
      client,
      list,
      calls,
      setRooms: (next: ChatRoom[]) => (rooms = next),
    }
  }

  it('마지막 메시지를 바꾸고 묶음의 메시지 수만큼 안 읽은 수를 올린다(방 목록을 다시 받지 않는다)', async () => {
    const { client, list, calls } = await openList([
      room(5, { lastMessage: message(5, 5) }),
    ])
    const roomsBefore = calls.rooms

    act(() => pushActivity(client, message(5, 8), V2, { messageCount: 3 }))
    expect(
      await within(list).findByLabelText('안 읽은 메시지 3개'),
    ).toBeInTheDocument()
    expect(within(list).getByText('5번 방 순번 8')).toBeInTheDocument()
    await settle()
    expect(calls.rooms).toBe(roomsBefore)
  })

  it('이미 아는 순번과 겹친 만큼은 세지 않고, 이미 반영한 묶음은 무시한다', async () => {
    const { client, list } = await openList([
      room(5, { lastMessage: message(5, 5) }),
    ])

    act(() => pushActivity(client, message(5, 7), V2, { messageCount: 2 }))
    // 6~8을 묶었지만 7까지는 이미 반영했다.
    act(() => pushActivity(client, message(5, 8), V2, { messageCount: 3 }))
    act(() => pushActivity(client, message(5, 8), V2, { messageCount: 3 }))
    expect(
      await within(list).findByLabelText('안 읽은 메시지 3개'),
    ).toBeInTheDocument()
    await settle()
  })

  it('옛 참여 세대의 알림은 반영하지 않는다', async () => {
    const { client, list } = await openList([
      room(5, { lastMessage: message(5, 5) }),
    ])

    act(() =>
      pushActivity(
        client,
        message(5, 8, { content: '옛 세대' }),
        { [PARTICIPATION_VERSION_HEADER]: '1' },
        { messageCount: 3 },
      ),
    )
    await settle()
    expect(within(list).queryByText('옛 세대')).toBeNull()
    expect(within(list).queryByLabelText(/안 읽은 메시지/)).toBeNull()
  })

  it('방 목록에 없는 방의 알림이면 방 목록을 다시 받는다', async () => {
    const { client, list, calls, setRooms } = await openList([room(5)])
    const roomsBefore = calls.rooms

    setRooms([room(5), room(6, { lastMessage: message(6, 1), unreadCount: 1 })])
    act(() => pushActivity(client, message(6, 1), V2))
    expect(
      await within(list).findByRole('link', { name: /노래하는 참새/ }),
    ).toBeInTheDocument()
    await settle()
    expect(calls.rooms).toBe(roomsBefore + 1)
  })

  it('방 topic을 구독한 방의 내 결과 큐 메시지는 이력에 합치지만, 열지 않은 방이면 이력 캐시를 건드리지 않는다', async () => {
    mockChat(
      () => [room(5), room(6)],
      (id) => [message(id, 1)],
    )
    const { client } = await openRoom(5, '5번 방 순번 1')
    // 6번 방 이력을 불러 둔 뒤 다른 방으로 옮겼다.
    await act(() =>
      queryClient.prefetchInfiniteQuery({
        queryKey: chatKeys.messages(6),
        queryFn: () => ({ messages: [message(6, 1)], nextCursor: null }),
        initialPageParam: null,
      }),
    )

    // 다른 기기에서 6번 방에 보낸 내 메시지
    act(() =>
      client.push(
        MY_MESSAGES,
        message(6, 3, { senderUserId: ME_ID, content: '다른 기기' }),
        V2,
      ),
    )
    const cached = queryClient.getQueryData<{
      pages: { messages: ChatMessage[] }[]
    }>(chatKeys.messages(6))
    expect(cached?.pages[0].messages.map((m) => m.roomSequence)).toEqual([1])
    await settle()
  })
})
