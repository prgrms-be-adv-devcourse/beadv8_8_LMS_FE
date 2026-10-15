import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatKeys } from '@/entities/chat/api'
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoom,
} from '@/entities/chat/types'
import { useChatStore } from './chatStore'
import { applyIncomingMessage, clearUnread, watchChatLoads } from './incoming'

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
    applyIncomingMessage(queryClient, arrived)
    applyIncomingMessage(queryClient, arrived)

    await finish([message({ messageId: 100, roomSequence: 1 })])

    expect(historyOf(queryClient, 5)).toEqual([200, 100])
  })

  it('조회 중 이력 캐시를 지우면(나가기·재입장) 보관한 메시지도 버려, 다시 불러온 이력에 끼어들지 않는다', async () => {
    void startHistoryFetch(queryClient, 5)
    applyIncomingMessage(
      queryClient,
      message({ messageId: 200, roomSequence: 2 }),
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

describe('중복 수신', () => {
  it('같은 메시지는 안 읽은 수에 한 번만 더한다', () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const arrived = message({ messageId: 200, chatRoomId: 6, roomSequence: 4 })
    applyIncomingMessage(queryClient, arrived)
    applyIncomingMessage(queryClient, arrived)

    const [updated] = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())!
    expect(updated.unreadCount).toBe(1)
  })

  it('방 목록에 없는 방의 메시지는 다시 받아도 방 목록을 다시 부른다', () => {
    queryClient.setQueryData(chatKeys.rooms(), [room()])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const arrived = message({ messageId: 200, chatRoomId: 9, roomSequence: 1 })
    applyIncomingMessage(queryClient, arrived)
    applyIncomingMessage(queryClient, arrived)

    const roomReloads = invalidate.mock.calls.filter(
      ([filters]) =>
        JSON.stringify(filters?.queryKey) === JSON.stringify(chatKeys.rooms()),
    )
    expect(roomReloads).toHaveLength(2)
  })
})
