import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatKeys } from '@/entities/chat/api'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import { useChatStore } from '@/features/chat/chatStore'
import { mergeIntoHistory } from '@/features/chat/incoming'
import {
  CHAT_FRAME_TYPE_HEADER,
  PARTICIPATION_VERSION_HEADER,
  SYNC_QUEUE,
} from '@/features/chat/receipt/contract'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { deliver, roomSubscription } from '@/test/chatServer'
import {
  GROUP_ROOM_ID,
  groupRoom,
  member,
  mockGroup,
} from '@/test/chatGroupMock'
import { FakeStompClient } from '@/test/fakeStomp'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PARTNER_ID = 8
const ROOM_ID = 5
const DIRECT_UNREAD = '상대가 아직 읽지 않음'

const room = (): ChatRoom => ({
  chatRoomId: ROOM_ID,
  roomType: 'DIRECT',
  status: 'ACTIVE',
  createdAt: '2026-10-14T10:00:00',
  members: [
    { userId: ME_ID, nickname: '하늘', active: true, participationVersion: 2 },
    {
      userId: PARTNER_ID,
      nickname: '편집하는 고래',
      active: true,
      participationVersion: 1,
    },
  ],
  lastMessage: null,
  unreadCount: 0,
})

/** 내가 보낸 일반 메시지(상대가 읽기 전이면 1) */
const mine = (
  roomSequence: number,
  unreadMemberCount?: number | null,
  patch: Partial<ChatMessage> = {},
): ChatMessage => ({
  messageId: 100 + roomSequence,
  chatRoomId: ROOM_ID,
  roomSequence,
  senderUserId: ME_ID,
  messageType: 'TEXT',
  content: `내 메시지 ${roomSequence}`,
  sentAt: '2026-11-03T10:00:00',
  ...(unreadMemberCount === undefined
    ? {}
    : { unreadMemberCount, readCountVersion: 1_762_149_600_000_000 }),
  ...patch,
})

/** 내 참여 세대 2의 프레임 헤더 */
const V2 = { [PARTICIPATION_VERSION_HEADER]: '2' }

/** 1:1 방 응답. history()가 그때의 서버 이력이고, 조회 수를 센다 */
function mockChat(history: () => ChatMessage[]) {
  const calls = { rooms: 0, history: 0 }
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
      return rs([room()])
    }),
    http.get(`*/api/v1/chats/${ROOM_ID}/messages`, () => {
      calls.history++
      return rs({
        messages: [...history()].reverse(),
        nextCursor: null,
        participationVersion: 2,
        readCountVersion: 1_762_149_600_000_000,
      })
    }),
  )
  return calls
}

async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

async function connectSocket() {
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  await settle()
  return client
}

async function openDirect(firstText: string) {
  renderApp(`/chat/${ROOM_ID}`, 'INFLUENCER')
  const thread = await screen.findByRole('region', { name: /님과의 대화/ })
  await within(thread).findByText(firstText)
  return thread
}

/** 메시지 말풍선이 든 줄 */
const row = (thread: HTMLElement, text: string) =>
  within(thread).getByText(text).parentElement!

/** 방 topic 구독으로 안 읽은 사람 수 갱신을 보낸다 */
function pushReadCounts(
  client: FakeStompClient,
  chatRoomId: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = V2,
) {
  act(() =>
    client.pushTo(
      roomSubscription(client, chatRoomId)!,
      { type: 'READ_COUNTS', roomId: chatRoomId, readCountVersion: 2, ...body },
      { [CHAT_FRAME_TYPE_HEADER]: 'READ_COUNTS', ...headers },
    ),
  )
}

afterEach(() => {
  cleanup()
  queryClient.clear()
  closeLoginModal()
  useChatStore.setState({ pending: {} })
})

describe('메시지별 안 읽은 사람 수', () => {
  it('1:1 방은 상대가 읽기 전 메시지에 1을 보이고, 0이거나 값이 없으면(값을 보내기 전 서버) 숨긴다', async () => {
    mockChat(() => [
      mine(1, 0),
      mine(2, 1),
      // 값을 아직 보내지 않는 서버
      mine(3),
      {
        ...mine(4, null),
        messageType: 'SYSTEM',
        content: '편집하는 고래님이 나갔습니다.',
      },
    ])
    const thread = await openDirect('내 메시지 1')
    expect(
      within(row(thread, '내 메시지 2')).getByLabelText(DIRECT_UNREAD),
    ).toHaveTextContent('1')
    expect(
      within(row(thread, '내 메시지 1')).queryByLabelText(DIRECT_UNREAD),
    ).toBeNull()
    expect(
      within(row(thread, '내 메시지 3')).queryByLabelText(DIRECT_UNREAD),
    ).toBeNull()
    expect(within(thread).queryAllByLabelText(DIRECT_UNREAD)).toHaveLength(1)
  })

  it('READ_COUNTS는 구간 안의 목록에 없는 메시지를 0으로 낮추고, 구간 밖은 두며, 재동기화하지 않는다', async () => {
    const calls = mockChat(() => [
      mine(1, 1),
      mine(2, 1),
      mine(3, 1),
      mine(4, 1),
    ])
    const thread = await openDirect('내 메시지 1')
    const client = await connectSocket()
    const before = { ...calls }

    pushReadCounts(client, ROOM_ID, {
      fromSequence: 2,
      toSequence: 3,
      counts: [],
    })

    await waitFor(() =>
      expect(
        within(row(thread, '내 메시지 2')).queryByLabelText(DIRECT_UNREAD),
      ).toBeNull(),
    )
    expect(
      within(row(thread, '내 메시지 3')).queryByLabelText(DIRECT_UNREAD),
    ).toBeNull()
    // fromSequence 앞, toSequence 뒤(센 뒤에 온 메시지)는 건드리지 않는다.
    expect(
      within(row(thread, '내 메시지 1')).getByLabelText(DIRECT_UNREAD),
    ).toBeInTheDocument()
    expect(
      within(row(thread, '내 메시지 4')).getByLabelText(DIRECT_UNREAD),
    ).toBeInTheDocument()
    await settle()
    expect(calls).toEqual(before)
  })

  it('같은 메시지는 작은 값을 남긴다: 더 큰 값의 프레임·옛 스냅샷의 이력 재조회로 다시 오르지 않는다', async () => {
    let history = [mine(1, 1), mine(2, 1)]
    mockChat(() => history)
    const thread = await openDirect('내 메시지 1')
    const client = await connectSocket()

    pushReadCounts(client, ROOM_ID, {
      fromSequence: 1,
      toSequence: 2,
      counts: [{ roomSequence: 2, unreadMemberCount: 1 }],
    })
    await waitFor(() =>
      expect(
        within(row(thread, '내 메시지 1')).queryByLabelText(DIRECT_UNREAD),
      ).toBeNull(),
    )
    // 늦게 온 옛 프레임
    pushReadCounts(client, ROOM_ID, {
      fromSequence: 1,
      toSequence: 2,
      counts: [
        { roomSequence: 1, unreadMemberCount: 1 },
        { roomSequence: 2, unreadMemberCount: 1 },
      ],
    })
    // 갱신 전에 만들어진 이력 응답
    history = [mine(1, 1), mine(2, 1)]
    await act(() =>
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(ROOM_ID) }),
    )
    await settle()
    expect(
      within(row(thread, '내 메시지 1')).queryByLabelText(DIRECT_UNREAD),
    ).toBeNull()
    expect(
      within(row(thread, '내 메시지 2')).getByLabelText(DIRECT_UNREAD),
    ).toBeInTheDocument()
  })

  it('새 메시지 프레임에 실린 값을 보이고, 그 뒤 갱신으로 낮춘다', async () => {
    mockChat(() => [mine(1, 0)])
    const thread = await openDirect('내 메시지 1')
    const client = await connectSocket()

    act(() => deliver(client, mine(2, 1), V2))
    expect(
      await within(thread).findByLabelText(DIRECT_UNREAD),
    ).toHaveTextContent('1')
    pushReadCounts(client, ROOM_ID, {
      fromSequence: 1,
      toSequence: 2,
      counts: [],
    })
    await waitFor(() =>
      expect(within(thread).queryByLabelText(DIRECT_UNREAD)).toBeNull(),
    )
  })

  it('같은 메시지를 더 작은 값으로 다시 받거나(중복 전달) 대조로 다시 받으면 그 값으로 낮춘다', async () => {
    mockChat(() => [mine(1, 1), mine(2, 1)])
    const thread = await openDirect('내 메시지 1')
    const client = await connectSocket()

    act(() => deliver(client, mine(1, 0), V2))
    await waitFor(() =>
      expect(
        within(row(thread, '내 메시지 1')).queryByLabelText(DIRECT_UNREAD),
      ).toBeNull(),
    )
    act(() => {
      mergeIntoHistory(queryClient, ROOM_ID, [mine(2, 0)])
    })
    await waitFor(() =>
      expect(
        within(row(thread, '내 메시지 2')).queryByLabelText(DIRECT_UNREAD),
      ).toBeNull(),
    )
  })

  it('갱신 프레임을 놓쳐도 재동기화 대조로 읽은 작은 값으로 낮춘다', async () => {
    let history = [mine(1, 1)]
    mockChat(() => history)
    const thread = await openDirect('내 메시지 1')
    const client = await connectSocket()
    history = [mine(1, 0)]

    act(() => client.push(SYNC_QUEUE, { type: 'RESYNC', reason: 'GAP' }))
    await waitFor(() =>
      expect(
        within(row(thread, '내 메시지 1')).queryByLabelText(DIRECT_UNREAD),
      ).toBeNull(),
    )
  })

  it('1:1 방에서 상대가 보낸 메시지의 1은 내가 아직 읽지 않은 것이라 따로 이름 붙인다', async () => {
    mockChat(() => [
      mine(1, 1, { senderUserId: PARTNER_ID, content: '상대 메시지' }),
    ])
    const thread = await openDirect('상대 메시지')
    expect(
      within(row(thread, '상대 메시지')).queryByLabelText(DIRECT_UNREAD),
    ).toBeNull()
    expect(
      within(row(thread, '상대 메시지')).getByLabelText('안 읽은 사람 1명'),
    ).toHaveTextContent('1')
  })

  it('다른 참여 세대의 구독으로 온 갱신과 형식이 틀린 갱신은 적용하지 않는다(재동기화도 하지 않는다)', async () => {
    const calls = mockChat(() => [mine(1, 1)])
    const thread = await openDirect('내 메시지 1')
    const client = await connectSocket()
    const before = { ...calls }

    pushReadCounts(
      client,
      ROOM_ID,
      { fromSequence: 1, toSequence: 1, counts: [] },
      { [PARTICIPATION_VERSION_HEADER]: '1' },
    )
    // toSequence가 없다
    pushReadCounts(client, ROOM_ID, { fromSequence: 1, counts: [] })
    await settle()
    expect(
      within(row(thread, '내 메시지 1')).getByLabelText(DIRECT_UNREAD),
    ).toBeInTheDocument()
    expect(calls).toEqual(before)
  })
})

describe('단체방의 안 읽은 사람 수', () => {
  it('모든 참여자가 일반 메시지 옆에 숫자를 보고, 안내에는 보이지 않는다', async () => {
    mockGroup({
      room: groupRoom({}, { hostUserId: 3, memberCount: 4 }),
      members: [member(3, '호스트 별'), member(ME_ID, '하늘')],
      messages: [
        {
          messageId: 901,
          chatRoomId: GROUP_ROOM_ID,
          roomSequence: 1,
          senderUserId: 3,
          sender: { userId: 3, nickname: '호스트 별', withdrawn: false },
          messageType: 'TEXT',
          content: '모두 안녕하세요',
          sentAt: '2026-11-03T10:00:00',
          unreadMemberCount: 2,
          readCountVersion: 1,
        },
        {
          messageId: 902,
          chatRoomId: GROUP_ROOM_ID,
          roomSequence: 2,
          senderUserId: 3,
          sender: null,
          messageType: 'SYSTEM',
          content: '',
          sentAt: '2026-11-03T10:01:00',
          notificationKind: 'GROUP_ROOM_CLOSED',
          groupRoomClosed: { v: 1, closedByUserId: 3 },
          unreadMemberCount: null,
          readCountVersion: null,
        },
      ],
    })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /단체방$/ })
    const greeting = (await within(thread).findByText('모두 안녕하세요'))
      .parentElement!
    expect(
      within(greeting).getByLabelText('안 읽은 사람 2명'),
    ).toHaveTextContent('2')
    expect(within(thread).queryAllByLabelText(/안 읽은 사람/)).toHaveLength(1)
  })
})
