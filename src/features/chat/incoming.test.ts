import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatKeys } from '@/entities/chat/api'
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoom,
} from '@/entities/chat/types'
import { useChatStore } from './chatStore'
import {
  applyIncomingMessage,
  applyRoomActivity,
  clearUnread,
  discardArrivals,
  mergeIntoHistory,
  watchChatLoads,
} from './incoming'

const ME = 1
const PARTNER = 8

const message = (patch: Partial<ChatMessage>): ChatMessage => ({
  messageId: 100,
  chatRoomId: 5,
  roomSequence: 1,
  senderUserId: PARTNER,
  messageType: 'TEXT',
  content: '메시지',
  sentAt: '2026-10-15T10:00:00',
  ...patch,
})

const room = (patch: Partial<ChatRoom> = {}): ChatRoom => ({
  chatRoomId: 6,
  roomType: 'DIRECT',
  status: 'ACTIVE',
  createdAt: '2026-10-14T10:00:00',
  members: [
    { userId: ME, nickname: '하늘', active: true, participationVersion: 1 },
    {
      userId: PARTNER,
      nickname: '고래',
      active: true,
      participationVersion: 1,
    },
  ],
  lastMessage: null,
  unreadCount: 0,
  ...patch,
})

/** 테스트가 정할 때 끝나는 조회 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const page = (messages: ChatMessage[]): ChatMessagePage => ({
  messages,
  nextCursor: null,
})

/** 이력 조회를 시작하고(끝나지 않은 채로) 끝낼 함수를 돌려준다 */
function startHistoryFetch(queryClient: QueryClient, chatRoomId: number) {
  const response = deferred<ChatMessagePage>()
  const done = queryClient.fetchInfiniteQuery({
    queryKey: chatKeys.messages(chatRoomId),
    queryFn: () => response.promise,
    initialPageParam: null as number | null,
  })
  // 캐시를 지우면 이 조회는 취소된다(테스트에서 기다리지 않는 경우).
  done.catch(() => undefined)
  return (messages: ChatMessage[]) => {
    response.resolve(page(messages))
    return done
  }
}

function historyOf(queryClient: QueryClient, chatRoomId: number) {
  return queryClient
    .getQueryData<InfiniteData<ChatMessagePage>>(chatKeys.messages(chatRoomId))
    ?.pages.flatMap((p) => p.messages.map((m) => m.messageId))
}

let queryClient: QueryClient
let stopWatching: () => void

beforeEach(() => {
  queryClient = new QueryClient()
  stopWatching = watchChatLoads(queryClient)
  useChatStore.setState({ myUserId: ME, viewingRoomId: null, pending: {} })
})

afterEach(() => {
  stopWatching()
  queryClient.clear()
  useChatStore.setState({ myUserId: null, viewingRoomId: null, pending: {} })
})

describe('조회 중 도착한 메시지 다시 반영', () => {
  it('조회 중 같은 메시지를 두 번 받아도 조회가 끝난 뒤 한 번만 남는다', async () => {
    const finish = startHistoryFetch(queryClient, 5)
    const arrived = message({ messageId: 200, roomSequence: 2 })
    applyIncomingMessage(queryClient, arrived, 'room')
    applyIncomingMessage(queryClient, arrived, 'room')

    await finish([message({ messageId: 100, roomSequence: 1 })])

    expect(historyOf(queryClient, 5)).toEqual([200, 100])
  })

  it('조회 중 이력 캐시를 지우면(나가기·재입장) 보관한 메시지도 버려, 다시 불러온 이력에 끼어들지 않는다', async () => {
    void startHistoryFetch(queryClient, 5)
    applyIncomingMessage(
      queryClient,
      message({ messageId: 200, roomSequence: 2 }),
      'room',
    )
    queryClient.removeQueries({ queryKey: chatKeys.messages(5) })

    // 재입장 뒤 조회 범위에는 이전 참여 때의 메시지가 없다.
    const finish = startHistoryFetch(queryClient, 5)
    await finish([message({ messageId: 300, roomSequence: 3 })])

    expect(historyOf(queryClient, 5)).toEqual([300])
  })

  it('방 목록 조회 중 받은 메시지를 그사이 읽으면, 조회가 끝나도 안 읽은 수에 다시 더하지 않는다', async () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const response = deferred<ChatRoom[]>()
    const done = queryClient.fetchQuery({
      queryKey: chatKeys.rooms(),
      queryFn: () => response.promise,
    })
    applyIncomingMessage(
      queryClient,
      message({ messageId: 200, chatRoomId: 6, roomSequence: 4 }),
      'room',
    )
    // 응답 전에 그 방을 열어 읽었다.
    clearUnread(queryClient, 6)

    // 응답은 메시지 도착 전 상태(마지막 메시지 없음)
    response.resolve([room()])
    await done

    const [updated] = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())!
    expect(updated.lastMessage?.messageId).toBe(200)
    expect(updated.unreadCount).toBe(0)
  })
})

describe('참여 세대가 바뀐 방의 보관 메시지', () => {
  it('방 목록 조회 중 받은 옛 세대 메시지는 세대가 바뀌면 버려, 새 세대 방의 마지막 메시지·안 읽은 수로 되살리지 않는다', async () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const response = deferred<ChatRoom[]>()
    const done = queryClient.fetchQuery({
      queryKey: chatKeys.rooms(),
      queryFn: () => response.promise,
    })
    applyIncomingMessage(
      queryClient,
      message({ messageId: 200, chatRoomId: 6, roomSequence: 4 }),
      'room',
    )
    // 다른 곳에서 재입장해 세대가 바뀌었다.
    discardArrivals(6)

    // 새 세대의 방에는 아직 보이는 메시지가 없다.
    response.resolve([room()])
    await done

    const [updated] = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())!
    expect(updated.lastMessage).toBeNull()
    expect(updated.unreadCount).toBe(0)
  })
})

describe('참여 세대가 바뀐 방 목록 응답', () => {
  it('방 목록 조회 중 받은 메시지는 응답이 다른 참여 세대(재입장)면 세대 전환 처리 전이라도 다시 반영하지 않는다', async () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const response = deferred<ChatRoom[]>()
    const done = queryClient.fetchQuery({
      queryKey: chatKeys.rooms(),
      queryFn: () => response.promise,
    })
    applyIncomingMessage(
      queryClient,
      message({ messageId: 200, chatRoomId: 6, roomSequence: 4 }),
      'room',
    )

    // 응답은 재입장한 새 세대(2)의 방이다. 새 조회 범위에는 아직 메시지가 없다.
    const rejoined = room()
    rejoined.members = rejoined.members.map((m) =>
      m.userId === ME ? { ...m, participationVersion: 2 } : m,
    )
    response.resolve([rejoined])
    await done

    const [updated] = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())!
    expect(updated.lastMessage).toBeNull()
    expect(updated.unreadCount).toBe(0)
  })
})

describe('중복 수신', () => {
  it('같은 메시지는 안 읽은 수에 한 번만 더한다', () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const arrived = message({ messageId: 200, chatRoomId: 6, roomSequence: 4 })
    applyIncomingMessage(queryClient, arrived, 'room')
    applyIncomingMessage(queryClient, arrived, 'room')

    const [updated] = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())!
    expect(updated.unreadCount).toBe(1)
  })

  it('방 목록에 없는 방의 메시지는 다시 받아도 방 목록을 다시 부른다', () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const arrived = message({ messageId: 200, chatRoomId: 9, roomSequence: 1 })
    applyIncomingMessage(queryClient, arrived, 'room')
    applyIncomingMessage(queryClient, arrived, 'room')

    const roomReloads = invalidate.mock.calls.filter(
      ([filters]) =>
        JSON.stringify(filters?.queryKey) === JSON.stringify(chatKeys.rooms()),
    )
    expect(roomReloads).toHaveLength(2)
  })
})

describe('전송 결과 복구', () => {
  const failed = {
    clientMessageId: 'c-1',
    content: '보낸 메시지',
    status: 'failed' as const,
  }

  it('이력 조회 결과에 내 메시지(같은 임시 ID)가 있으면 실패 표시를 지운다', async () => {
    useChatStore.setState({ pending: { 5: [failed] } })
    const finish = startHistoryFetch(queryClient, 5)
    await finish([
      message({
        senderUserId: ME,
        clientMessageId: 'c-1',
        content: '보낸 메시지',
      }),
    ])
    expect(useChatStore.getState().pending[5]).toBeUndefined()
  })

  it('방 목록의 마지막 메시지만으로는 지우지 않는다(이력이 더 오래되면 메시지가 사라지므로)', async () => {
    useChatStore.setState({ pending: { 5: [failed] } })
    await queryClient.fetchQuery({
      queryKey: chatKeys.rooms(),
      queryFn: async () => [
        room({
          chatRoomId: 5,
          lastMessage: message({ senderUserId: ME, clientMessageId: 'c-1' }),
        }),
      ],
    })
    expect(useChatStore.getState().pending[5]).toEqual([failed])
  })
})

describe('대조·전송 확인으로 찾은 메시지 합치기', () => {
  it('이력을 다시 부르는 중에 합친 메시지는 그보다 먼저 만들어진 조회 응답이 덮어써도 남는다', async () => {
    queryClient.setQueryData(chatKeys.messages(5), {
      pages: [page([message({ messageId: 101, roomSequence: 1 })])],
      pageParams: [null],
    })
    // 다시 부르는 중(응답은 순번 1까지만 담고 있다)
    const finish = startHistoryFetch(queryClient, 5)
    expect(
      mergeIntoHistory(queryClient, 5, [
        message({ messageId: 102, roomSequence: 2 }),
      ]),
    ).toBe(true)
    await finish([message({ messageId: 101, roomSequence: 1 })])

    expect(historyOf(queryClient, 5)).toEqual([102, 101])
  })

  it('이력을 불러 두지 않은 방이면 합치지 않고 false', () => {
    expect(mergeIntoHistory(queryClient, 6, [message({ chatRoomId: 6 })])).toBe(
      false,
    )
  })
})

describe('열어 둔 방(방 topic)과 열지 않은 방(새 메시지 알림)', () => {
  const unreadIn = (chatRoomId: number) =>
    queryClient
      .getQueryData<ChatRoom[]>(chatKeys.rooms())
      ?.find((r) => r.chatRoomId === chatRoomId)?.unreadCount

  it('열지 않은 방이라 이력에 넣지 않은 내 메시지가 그 방을 연 뒤 다시 오면 이력에 합친다', () => {
    queryClient.setQueryData(chatKeys.messages(5), {
      pages: [page([message({ messageId: 101, roomSequence: 1 })])],
      pageParams: [null],
    })
    const mine = message({ messageId: 102, roomSequence: 2, senderUserId: ME })

    expect(applyIncomingMessage(queryClient, mine, 'mine')).toBe(false)
    expect(historyOf(queryClient, 5)).toEqual([101])

    useChatStore.setState({ viewingRoomId: 5 })
    expect(applyIncomingMessage(queryClient, mine, 'mine')).toBe(true)
    expect(historyOf(queryClient, 5)).toEqual([102, 101])
  })

  it('새 메시지 알림으로 센 순번은 같은 메시지가 방 topic으로 늦게 와도 다시 세지 않는다', () => {
    queryClient.setQueryData(chatKeys.rooms(), [
      room({
        chatRoomId: 5,
        lastMessage: message({ messageId: 101, roomSequence: 1 }),
      }),
    ])
    applyRoomActivity(queryClient, {
      type: 'ROOM_ACTIVITY',
      chatRoomId: 5,
      participationVersion: 1,
      lastSequence: 3,
      messageCount: 2,
      lastMessage: message({ messageId: 103, roomSequence: 3 }),
    })
    expect(unreadIn(5)).toBe(2)

    for (const [messageId, roomSequence] of [
      [102, 2],
      [103, 3],
    ])
      applyIncomingMessage(
        queryClient,
        message({ messageId, roomSequence }),
        'room',
      )
    expect(unreadIn(5)).toBe(2)

    applyIncomingMessage(
      queryClient,
      message({ messageId: 104, roomSequence: 4 }),
      'room',
    )
    expect(unreadIn(5)).toBe(3)
  })
})
