import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/entities/chat/api'
import type {
  ChatError,
  ChatMessage,
  ChatMessagePage,
  ChatRoom,
} from '@/entities/chat/types'
import { toast } from '@/shared/ui/toastStore'
import {
  clearRoomPending,
  failPending,
  resolvePending,
  resolvePendingByIds,
  useChatStore,
} from './chatStore'
import { isPageActive } from './pageActive'

type MessagePages = InfiniteData<ChatMessagePage, number | null>

/** 방 목록을 불러오는 동안 도착한 메시지와, 도착 당시 안 읽은 수로 셌는지 */
type RoomArrival = { message: ChatMessage; countsAsUnread: boolean }

// 조회 중에 도착한 메시지. 조회 응답이 그 메시지보다 먼저 만들어졌으면 응답에 빠지므로(이력),
// 또는 응답이 로컬에서 올린 안 읽은 수·마지막 메시지를 덮으므로(방 목록) 조회가 끝나면 다시 반영한다.
// watchChatLoads()가 반영하고 비운다.
const historyArrivals = new Map<number, ChatMessage[]>()
let roomArrivals: RoomArrival[] = []

/**
 * 이미 반영한 실시간 메시지 ID. 같은 메시지가 다시 오면(중복 전달·재전송 응답) 목록·안 읽은 수에
 * 두 번 반영하지 않는다. 오래된 것부터 지워 크기를 제한한다.
 */
const appliedIds = new Set<number>()
const APPLIED_LIMIT = 1000

/** 처음 보는 메시지면 기억하고 true */
function rememberApplied(messageId: number) {
  if (appliedIds.has(messageId)) return false
  appliedIds.add(messageId)
  if (appliedIds.size > APPLIED_LIMIT) {
    const oldest = appliedIds.values().next().value
    if (oldest !== undefined) appliedIds.delete(oldest)
  }
  return true
}

function isFetching(queryClient: QueryClient, queryKey: readonly unknown[]) {
  return queryClient.getQueryState(queryKey)?.fetchStatus === 'fetching'
}

/**
 * 메시지들을 이력 캐시 첫 페이지(최신)에 합친다. 이미 있는 메시지(같은 ID)는 건너뛰고,
 * 첫 페이지는 최신순(roomSequence 내림차순)을 지킨다.
 */
function mergeIntoPages(data: MessagePages, messages: ChatMessage[]) {
  const known = new Set(
    data.pages.flatMap((page) => page.messages.map((m) => m.messageId)),
  )
  // 이미 있는 메시지와, 이번에 합칠 메시지끼리의 중복(같은 메시지를 두 번 받은 경우)을 모두 건너뛴다.
  const added = messages.filter((m) => {
    if (known.has(m.messageId)) return false
    known.add(m.messageId)
    return true
  })
  if (added.length === 0) return data
  const [first, ...rest] = data.pages
  const merged = [...added, ...first.messages].sort(
    (a, b) => b.roomSequence - a.roomSequence,
  )
  return { ...data, pages: [{ ...first, messages: merged }, ...rest] }
}

/** 방 목록 응답에 빠진(응답의 마지막 메시지보다 새) 메시지만 마지막 메시지·안 읽은 수에 다시 반영한다. */
function reapplyToRooms(rooms: ChatRoom[], arrivals: RoomArrival[]) {
  return rooms.map((room) =>
    arrivals
      .filter((a) => a.message.chatRoomId === room.chatRoomId)
      .sort((a, b) => a.message.roomSequence - b.message.roomSequence)
      .reduce((acc, { message, countsAsUnread }) => {
        if (
          acc.lastMessage &&
          acc.lastMessage.roomSequence >= message.roomSequence
        )
          return acc
        return {
          ...acc,
          lastMessage: message,
          unreadCount: (acc.unreadCount ?? 0) + (countsAsUnread ? 1 : 0),
        }
      }, room),
  )
}

/**
 * 서버에 저장된 내 메시지의 임시 ID로 보내는 중·실패 표시를 정리한다(응답을 놓친 전송의 결과 복구).
 * 내 메시지에만 clientMessageId가 담기지만, 이전 BE를 생각해 보낸 사람도 확인한다.
 */
function resolveSavedPending(chatRoomId: number, messages: ChatMessage[]) {
  const { myUserId } = useChatStore.getState()
  const ids = new Set<string>()
  for (const m of messages)
    if (m.clientMessageId && m.senderUserId === myUserId)
      ids.add(m.clientMessageId)
  resolvePendingByIds(chatRoomId, ids)
}

/**
 * 채팅 조회(이력·방 목록)가 성공할 때마다 그동안 도착해 보관한 메시지를 결과에 다시 반영하고,
 * 이력 조회 결과의 저장된 내 메시지로 보내는 중·실패 표시를 정리한다.
 * 채팅 연결이 있는 동안 구독하고, 돌려준 함수로 구독을 끊고 보관한 메시지를 버린다.
 */
export function watchChatLoads(queryClient: QueryClient) {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const [scope, kind, chatRoomId] = event.query.queryKey
    if (scope !== chatKeys.all[0]) return
    // 나가기·재입장은 그 방의 이력 캐시를 지운다. 보관한 메시지도 버려야, 다시 불러온 이력(새 조회 범위)에
    // 이전 참여 때 받은 메시지가 끼어들지 않는다.
    if (event.type === 'removed') {
      if (kind === 'messages') historyArrivals.delete(Number(chatRoomId))
      if (kind === 'rooms') roomArrivals = []
      return
    }
    // setQueryData(실시간 메시지 반영 등)도 manual 'success'를 낸다. 실제 조회 결과일 때만 반영한다.
    if (
      event.type !== 'updated' ||
      event.action.type !== 'success' ||
      event.action.manual
    )
      return
    if (kind === 'messages') {
      const roomId = Number(chatRoomId)
      const arrived = historyArrivals.get(roomId)
      if (arrived) {
        historyArrivals.delete(roomId)
        queryClient.setQueryData<MessagePages>(event.query.queryKey, (data) =>
          data ? mergeIntoPages(data, arrived) : data,
        )
      }
      const data = queryClient.getQueryData<MessagePages>(event.query.queryKey)
      if (data)
        resolveSavedPending(
          roomId,
          data.pages.flatMap((p) => p.messages),
        )
    } else if (kind === 'rooms' && roomArrivals.length > 0) {
      // 방 목록의 마지막 메시지로는 보내는 중 표시를 정리하지 않는다. 보내는 중 표시는 그 방 대화에서만
      // 보이고 대화를 열면 이력을 불러와 정리된다. 방 목록만으로 정리하면 이력이 그보다 오래된 경우
      // 메시지가 화면에서 사라진다.
      const arrived = roomArrivals
      roomArrivals = []
      queryClient.setQueryData<ChatRoom[]>(chatKeys.rooms(), (rooms) =>
        rooms ? reapplyToRooms(rooms, arrived) : rooms,
      )
    }
  })
  return () => {
    unsubscribe()
    historyArrivals.clear()
    roomArrivals = []
    appliedIds.clear()
  }
}

/**
 * 실시간으로 받은 메시지(/user/queue/chats/messages)를 반영한다. 보낸 사람 자신에게도 온다.
 * 순서가 뒤바뀌어 올 수 있고(순번으로 정렬해 그린다), 같은 메시지가 다시 오면 한 번만 반영한다.
 * - 그 방의 이력 캐시 맨 앞(최신)에 붙인다. 이력을 아직 불러오지 않은 방은 열 때 불러온다
 * - 내가 보낸 것이면 보내는 중 표시를 지운다
 * - 방 목록 캐시의 마지막 메시지를 바꾸고, 보고 있지 않은 방에 상대가 보낸 것이면 안 읽은 수를 올린다
 * - 이력·방 목록을 불러오는 중이면 보관했다가 조회가 끝나면 다시 반영한다(응답에 빠졌을 수 있다)
 */
export function applyIncomingMessage(
  queryClient: QueryClient,
  message: ChatMessage,
) {
  // 내가 다시 보낸 메시지에 서버가 기존 메시지를 돌려줘도 보내는 중 표시는 지운다.
  resolvePending(message)
  // 이미 반영한 메시지(중복 전달)는 목록·안 읽은 수에 다시 반영하지 않는다.
  // 다만 방 목록에 아직 없는 방이면 다시 부른다. 처음 받았을 때의 재조회가 방이 생기기 전 상태를
  // 돌려줬을 수 있다.
  if (!rememberApplied(message.messageId)) {
    const known = queryClient
      .getQueryData<ChatRoom[]>(chatKeys.rooms())
      ?.some((r) => r.chatRoomId === message.chatRoomId)
    if (!known)
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
    return
  }

  const historyKey = chatKeys.messages(message.chatRoomId)
  const rooms = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())
  const cached = rooms?.find((r) => r.chatRoomId === message.chatRoomId)
  // 방 목록에 없는 방의 메시지는 상대가 새로 시작했거나 서버가 나를 재입장시킨 것이다(내가 나갔던 방에 상대가
  // 다시 시작·출연 알림). 남아 있는 이력·보내는 중 표시는 이전 참여 때의 것이라 버리고, 열 때 새 조회 범위로 불러온다.
  if (rooms && !cached) {
    queryClient.removeQueries({ queryKey: historyKey })
    clearRoomPending(message.chatRoomId)
  }
  if (isFetching(queryClient, historyKey)) {
    const arrived = historyArrivals.get(message.chatRoomId) ?? []
    historyArrivals.set(message.chatRoomId, [...arrived, message])
  }
  queryClient.setQueryData<MessagePages>(historyKey, (data) =>
    data ? mergeIntoPages(data, [message]) : data,
  )

  const { myUserId, viewingRoomId } = useChatStore.getState()
  // 보고 있는 방이라도 탭이 가려졌거나 포커스가 없으면 아직 읽지 않은 것이다(다시 보일 때 읽음 처리).
  const countsAsUnread =
    message.senderUserId !== myUserId &&
    (viewingRoomId !== message.chatRoomId || !isPageActive())
  if (isFetching(queryClient, chatKeys.rooms()))
    roomArrivals.push({ message, countsAsUnread })
  // 나간 것으로 알고 있던 회원이 보낸 메시지면 그 회원이 다시 채팅을 시작(재입장)한 것이다.
  const senderRejoined =
    cached?.members.some(
      (m) => m.userId === message.senderUserId && !m.active,
    ) === true
  queryClient.setQueryData<ChatRoom[]>(chatKeys.rooms(), (list) =>
    list?.map((room) => {
      if (room.chatRoomId !== message.chatRoomId) return room
      const newer =
        !room.lastMessage ||
        room.lastMessage.roomSequence < message.roomSequence
      return {
        ...room,
        lastMessage: newer ? message : room.lastMessage,
        unreadCount: (room.unreadCount ?? 0) + (countsAsUnread ? 1 : 0),
      }
    }),
  )
  // 퇴장 안내(SYSTEM)·재입장은 참여 상태가 바뀐 것이고, 모르는 방의 메시지는 상대가 새로 시작한 방이다.
  // 출연 알림(NOTIFICATION)은 BE가 방을 새로 만들거나 나갔던 받는 사람(나)을 재입장시킨 뒤 보낸다.
  if (
    message.messageType === 'SYSTEM' ||
    message.messageType === 'NOTIFICATION' ||
    !cached ||
    senderRejoined
  ) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
  }
}

/**
 * 방 목록 캐시에서 이 방의 안 읽은 수를 0으로 (읽음 처리 직후).
 * 방 목록 조회 중에 보관한 이 방 메시지도 읽은 것으로 바꿔, 조회가 끝난 뒤 안 읽은 수에 다시 더하지 않는다.
 */
export function clearUnread(queryClient: QueryClient, chatRoomId: number) {
  roomArrivals = roomArrivals.map((a) =>
    a.message.chatRoomId === chatRoomId ? { ...a, countsAsUnread: false } : a,
  )
  queryClient.setQueryData<ChatRoom[]>(chatKeys.rooms(), (list) =>
    list?.map((room) =>
      room.chatRoomId === chatRoomId ? { ...room, unreadCount: 0 } : room,
    ),
  )
}

/** 방 목록 캐시의 이 방 안 읽은 수 */
export function unreadOf(queryClient: QueryClient, chatRoomId: number) {
  return (
    queryClient
      .getQueryData<ChatRoom[]>(chatKeys.rooms())
      ?.find((room) => room.chatRoomId === chatRoomId)?.unreadCount ?? 0
  )
}

/**
 * 보내기 오류(/user/queue/chats/errors). 어느 메시지인지 알면 그 메시지를 실패로 표시한다.
 * 상대가 나간 방이면 방 상태를 다시 불러와 다시 시작 안내를 띄운다.
 */
export function applyChatError(queryClient: QueryClient, error: ChatError) {
  if (error.clientMessageId) failPending(error.clientMessageId, error.message)
  toast(error.message)
  if (
    error.code === 'CHAT_PARTNER_LEFT' ||
    error.code === 'NOT_CHAT_ROOM_MEMBER'
  ) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
  }
}
