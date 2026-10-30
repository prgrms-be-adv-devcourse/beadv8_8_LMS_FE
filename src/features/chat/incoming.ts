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
import type { RoomActivity } from './receipt/contract'
import { createGapWatcher, type GapWatcher } from './receipt/gapWatcher'
import { RECEIPT_POLICY } from './receipt/policy'

type MessagePages = InfiniteData<ChatMessagePage, number | null>

/**
 * 방 목록을 불러오는 동안 도착한 메시지(새 메시지 알림이면 묶음의 마지막 메시지)와, 도착 당시 안 읽은 수로 센 개수.
 * participationVersion은 도착 당시 방 목록의 내 참여 세대다(응답이 다른 세대면 다시 반영하지 않는다)
 */
type RoomArrival = {
  message: ChatMessage
  unread: number
  participationVersion?: number
}

/** 방 목록 항목의 내 참여 세대 */
function myVersionIn(room: ChatRoom | undefined, myUserId: number | null) {
  return room?.members.find((m) => m.userId === myUserId)?.participationVersion
}

// 조회 중에 도착한 메시지. 조회 응답이 그 메시지보다 먼저 만들어졌으면 응답에 빠지므로(이력),
// 또는 응답이 로컬에서 올린 안 읽은 수·마지막 메시지를 덮으므로(방 목록) 조회가 끝나면 다시 반영한다.
// watchChatLoads()가 반영하고 비운다.
const historyArrivals = new Map<number, ChatMessage[]>()
let roomArrivals: RoomArrival[] = []
// 실시간 메시지의 순번 간격. 프레임 순서가 뒤바뀌어 올 수 있어 잠시 기다린 뒤에도 비어 있을 때만 대조를 맡긴다.
// watchChatLoads()가 채팅 연결 동안 만든다.
let gaps: GapWatcher | null = null

/**
 * 이미 반영한 실시간 메시지 ID. 같은 메시지가 다시 오면(중복 전달·재전송 응답) 목록·안 읽은 수에
 * 두 번 반영하지 않는다. 오래된 것부터 지워 크기를 제한한다.
 */
const appliedIds = new Set<number>()
const APPLIED_LIMIT = 1000

/** 방별로 새 메시지 알림이 안 읽은 수에 반영한 가장 큰 순번. 같은 메시지가 방 topic으로 늦게 와도 다시 세지 않는다 */
const activityCounted = new Map<number, number>()

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
 * 받은 메시지 앞에 빠진 순번이 있는지. 방 순번(roomSequence)은 방 안에서 1씩 늘어나므로,
 * 지금까지 알던 마지막 메시지 순번 + 1보다 크면 그 사이를 받지 못한 것이다(연결 중 전달 실패·프레임 유실).
 * 마지막 메시지가 시스템 안내(재입장·퇴장)면 건너뛴다: 재입장으로 조회 시작점(visibleFromSequence)이 바뀌면
 * 안내 다음 메시지와의 사이가 자연스럽게 벌어진다.
 */
function hasGapAfter(
  last: ChatMessage | null | undefined,
  message: ChatMessage,
) {
  if (!last || last.messageType === 'SYSTEM') return false
  return message.roomSequence > last.roomSequence + 1
}

/** 이력 캐시에서 가장 최신(순번이 가장 큰) 메시지 */
function latestInPages(data: MessagePages) {
  return data.pages[0]?.messages[0]
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

/**
 * 마지막 메시지가 last인 방에 lastSequence까지의 메시지 count개가 왔을 때 더할 안 읽은 수.
 * 이미 아는 순번까지는 세지 않는다(새 메시지 알림 묶음이 이미 반영한 메시지와 겹칠 때). 순번에는 시스템 안내도
 * 끼므로 정확한 값이 아니라 추정치다(방을 열 때·방 목록을 다시 받을 때 서버 값으로 맞춘다)
 */
function newUnread(
  last: ChatMessage | null | undefined,
  lastSequence: number,
  count: number,
) {
  if (!last) return count
  return Math.max(0, Math.min(count, lastSequence - last.roomSequence))
}

/** 방 목록 응답에 빠진(응답의 마지막 메시지보다 새) 메시지만 마지막 메시지·안 읽은 수에 다시 반영한다. */
function reapplyToRooms(
  rooms: ChatRoom[],
  arrivals: RoomArrival[],
  myUserId: number | null,
) {
  return rooms.map((room) => {
    // 응답이 도착 당시와 다른 참여 세대(재입장)면 그 메시지는 이전 참여 범위의 것이라 다시 반영하지 않는다.
    // 세대 전환 처리(receiptService)보다 이 반영이 먼저 돌 수 있어 여기서도 가린다.
    const version = myVersionIn(room, myUserId)
    return arrivals
      .filter(
        (a) =>
          a.message.chatRoomId === room.chatRoomId &&
          (a.participationVersion === undefined ||
            version === undefined ||
            a.participationVersion === version),
      )
      .sort((a, b) => a.message.roomSequence - b.message.roomSequence)
      .reduce((acc, { message, unread }) => {
        if (
          acc.lastMessage &&
          acc.lastMessage.roomSequence >= message.roomSequence
        )
          return acc
        return {
          ...acc,
          lastMessage: message,
          unreadCount:
            (acc.unreadCount ?? 0) +
            newUnread(acc.lastMessage, message.roomSequence, unread),
        }
      }, room)
  })
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

/** 이 방에서 조회 중에 받아 보관한 메시지(이력·방 목록용)와 간격 대기를 버린다(참여 세대가 바뀌어 새 세대에 합치면 안 될 때) */
export function discardArrivals(chatRoomId: number) {
  historyArrivals.delete(chatRoomId)
  activityCounted.delete(chatRoomId)
  // 방 목록 조회가 끝날 때 옛 세대 메시지를 새 세대 방의 마지막 메시지·안 읽은 수로 되살리지 않게 한다.
  roomArrivals = roomArrivals.filter((a) => a.message.chatRoomId !== chatRoomId)
  gaps?.discard(chatRoomId)
}

/**
 * 대조·전송 확인으로 찾은 메시지를 그 방 이력 캐시에 합친다(messageId 중복 제거, 순번 정렬).
 * 저장된 내 메시지의 보내는 중·실패 표시도 정리한다. 이력 캐시가 없으면(열지 않은 방) 아무것도 하지 않고 false
 */
export function mergeIntoHistory(
  queryClient: QueryClient,
  chatRoomId: number,
  messages: ChatMessage[],
) {
  const key = chatKeys.messages(chatRoomId)
  if (!queryClient.getQueryData<MessagePages>(key)) return false
  // 이력을 다시 부르는 중이면 그 응답이 이 메시지보다 먼저 만들어졌을 수 있다. 보관했다가 조회가 끝나면 다시 합친다.
  if (messages.length > 0 && isFetching(queryClient, key)) {
    const arrived = historyArrivals.get(chatRoomId) ?? []
    historyArrivals.set(chatRoomId, [...arrived, ...messages])
  }
  if (messages.length > 0) {
    queryClient.setQueryData<MessagePages>(key, (data) =>
      data ? mergeIntoPages(data, messages) : data,
    )
    gaps?.arrived(
      chatRoomId,
      messages.map((m) => m.roomSequence),
    )
    resolveSavedPending(chatRoomId, messages)
  }
  return true
}

/**
 * 채팅 조회(이력·방 목록)가 성공할 때마다 그동안 도착해 보관한 메시지를 결과에 다시 반영하고,
 * 이력 조회 결과의 저장된 내 메시지로 보내는 중·실패 표시를 정리한다.
 * 실시간 메시지의 순번 간격이 유예(RECEIPT_POLICY.gap.graceMs) 뒤에도 비어 있으면 onMissingSequences로 알린다.
 * 채팅 연결이 있는 동안 구독하고, 돌려준 함수로 구독을 끊고 보관한 메시지·간격 대기를 버린다.
 */
export function watchChatLoads(
  queryClient: QueryClient,
  onMissingSequences: (chatRoomId: number) => void = () => {},
) {
  gaps?.dispose()
  const watcher = createGapWatcher({
    graceMs: RECEIPT_POLICY.gap.graceMs,
    onMissing: onMissingSequences,
  })
  gaps = watcher
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const [scope, kind, chatRoomId] = event.query.queryKey
    if (scope !== chatKeys.all[0]) return
    // 나가기·재입장은 그 방의 이력 캐시를 지운다. 보관한 메시지도 버려야, 다시 불러온 이력(새 조회 범위)에
    // 이전 참여 때 받은 메시지가 끼어들지 않는다.
    if (event.type === 'removed') {
      if (kind === 'messages') {
        historyArrivals.delete(Number(chatRoomId))
        watcher.discard(Number(chatRoomId))
      }
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
      if (data) {
        const messages = data.pages.flatMap((p) => p.messages)
        // 다시 불러온 이력에 있는 순번은 더 기다리지 않는다.
        watcher.arrived(
          roomId,
          messages.map((m) => m.roomSequence),
        )
        resolveSavedPending(roomId, messages)
      }
    } else if (kind === 'rooms') {
      // 방 목록의 마지막 메시지로는 보내는 중 표시를 정리하지 않는다. 보내는 중 표시는 그 방 대화에서만
      // 보이고 대화를 열면 이력을 불러와 정리된다. 방 목록만으로 정리하면 이력이 그보다 오래된 경우
      // 메시지가 화면에서 사라진다.
      if (roomArrivals.length > 0) {
        const arrived = roomArrivals
        roomArrivals = []
        queryClient.setQueryData<ChatRoom[]>(chatKeys.rooms(), (rooms) =>
          rooms
            ? reapplyToRooms(rooms, arrived, useChatStore.getState().myUserId)
            : rooms,
        )
      }
    }
  })
  return () => {
    unsubscribe()
    watcher.dispose()
    if (gaps === watcher) gaps = null
    historyArrivals.clear()
    roomArrivals = []
    appliedIds.clear()
    activityCounted.clear()
  }
}

/**
 * 실시간으로 받은 메시지를 반영한다. source는 받은 경로다.
 * - room: 열어 둔 방의 방 topic. 그 방의 모든 새 메시지가 온다(내가 보낸 것은 이 세션에 온 것에만 clientMessageId가 있다)
 * - mine: 회원 큐(/user/queue/chats/messages). 내가 보낸 메시지의 결과가 내 모든 세션에 온다
 * 순서가 뒤바뀌어 올 수 있고(순번으로 정렬해 그린다), 같은 메시지가 두 경로로 오거나 다시 오면 한 번만 반영한다.
 * - 열어 둔 방이면 그 방의 이력 캐시 맨 앞(최신)에 붙인다. 열지 않은 방의 이력 캐시는 실시간으로 이어지지 않으므로
 *   건드리지 않는다(열 때 다시 불러온다)
 * - 내가 보낸 것이면 보내는 중 표시를 지운다
 * - 방 목록 캐시의 마지막 메시지를 바꾸고, 보고 있지 않은 방에 상대가 보낸 것이면 안 읽은 수를 올린다
 * - 이력·방 목록을 불러오는 중이면 보관했다가 조회가 끝나면 다시 반영한다(응답에 빠졌을 수 있다)
 * 이력 캐시에 이어 반영했으면(수신 확인 위치로 기록할 수 있으면) true
 */
export function applyIncomingMessage(
  queryClient: QueryClient,
  message: ChatMessage,
  source: 'room' | 'mine',
) {
  const { myUserId, viewingRoomId } = useChatStore.getState()
  // 내가 다시 보낸 메시지에 서버가 기존 메시지를 돌려줘도 보내는 중 표시는 지운다. 방 topic의 내 메시지에
  // clientMessageId가 없으면(다른 세션에서 보낸 것) 같은 내용으로 짐작해 지우지 않는다(이 세션의 다른 메시지를
  // 지울 수 있다).
  if (source === 'mine' || message.clientMessageId) resolvePending(message)
  const live = source === 'room' || message.chatRoomId === viewingRoomId
  // 순서가 뒤바뀌어 늦게 온 순번이면 그 간격은 더 기다리지 않는다.
  gaps?.arrived(message.chatRoomId, [message.roomSequence])
  // 이미 반영한 메시지(중복 전달)는 목록·안 읽은 수에 다시 반영하지 않는다. 이력에는 합친다(처음 받았을 때 열지 않은
  // 방이라 이력에 넣지 않았을 수 있다. 합칠 때 messageId로 중복을 버린다).
  const first = rememberApplied(message.messageId)

  const historyKey = chatKeys.messages(message.chatRoomId)
  const rooms = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())
  const cached = rooms?.find((r) => r.chatRoomId === message.chatRoomId)
  // 방 목록에 없는 방의 메시지는 상대가 새로 시작했거나 서버가 나를 재입장시킨 것이다(내가 나갔던 방에 상대가
  // 다시 시작·출연 알림). 남아 있는 이력·보내는 중 표시는 이전 참여 때의 것이라 버리고, 열 때 새 조회 범위로 불러온다.
  if (first && rooms && !cached) {
    queryClient.removeQueries({ queryKey: historyKey })
    clearRoomPending(message.chatRoomId)
  }
  if (live) {
    if (isFetching(queryClient, historyKey)) {
      const arrived = historyArrivals.get(message.chatRoomId) ?? []
      historyArrivals.set(message.chatRoomId, [...arrived, message])
    }
    // 이력을 불러 둔 방에서 순번이 건너뛰었으면 빠진 순번을 기다린다. 유예 뒤에도 비어 있으면 대조가 이력을 다시 읽어
    // 채운다(합칠 때 messageId로 중복 제거). 이력이 없는 방은 열 때 불러오므로 대상이 아니다.
    const history = queryClient.getQueryData<MessagePages>(historyKey)
    const latest = history && latestInPages(history)
    if (latest && hasGapAfter(latest, message))
      gaps?.expect(
        message.chatRoomId,
        latest.roomSequence + 1,
        message.roomSequence - 1,
      )
    queryClient.setQueryData<MessagePages>(historyKey, (data) =>
      data ? mergeIntoPages(data, [message]) : data,
    )
  }
  // 방 목록에 아직 없는 방이면 다시 부른다. 처음 받았을 때의 재조회가 방이 생기기 전 상태를 돌려줬을 수 있다.
  if (!first) {
    if (!cached)
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
    return live
  }

  // 보고 있는 방이라도 탭이 가려졌거나 포커스가 없으면 아직 읽지 않은 것이다(다시 보일 때 읽음 처리).
  // 새 메시지 알림으로 이미 센 순번은 다시 세지 않는다(구독 직후 알림과 방 topic이 같은 메시지를 알릴 때).
  const countsAsUnread =
    message.senderUserId !== myUserId &&
    (viewingRoomId !== message.chatRoomId || !isPageActive()) &&
    message.roomSequence > (activityCounted.get(message.chatRoomId) ?? 0)
  if (isFetching(queryClient, chatKeys.rooms()))
    roomArrivals.push({
      message,
      unread: countsAsUnread ? 1 : 0,
      participationVersion: myVersionIn(cached, myUserId),
    })
  // 나간 것으로 알고 있던 회원이 보낸 메시지면 그 회원이 다시 채팅을 시작(재입장)한 것이다.
  const senderRejoined =
    cached?.members.some(
      (m) => m.userId === message.senderUserId && !m.active,
    ) === true
  // 방 목록의 마지막 메시지와도 순번이 건너뛰었으면 안 읽은 수·마지막 메시지가 틀릴 수 있다. 유예 뒤에도 비어 있으면
  // 방 목록을 다시 받는다.
  const lastInRoom = cached?.lastMessage
  if (lastInRoom && hasGapAfter(lastInRoom, message))
    gaps?.expect(
      message.chatRoomId,
      lastInRoom.roomSequence + 1,
      message.roomSequence - 1,
    )
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
  return live
}

/**
 * 새 메시지 알림(ROOM_ACTIVITY)을 방 목록에 반영한다. 방 topic을 구독하지 않은 방(열지 않은 방)의 묶음이 온다.
 * 마지막 메시지를 바꾸고 안 읽은 수를 묶음의 메시지 수만큼 올린다(이미 아는 순번과 겹치는 만큼은 빼는 추정치).
 * 이력 캐시와 순번 간격 대기는 건드리지 않는다(메시지 전체가 아니다). 참여 세대는 부르는 쪽이 먼저 확인한다.
 */
export function applyRoomActivity(
  queryClient: QueryClient,
  activity: RoomActivity,
) {
  const { chatRoomId, lastSequence, messageCount, lastMessage } = activity
  const rooms = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())
  const cached = rooms?.find((r) => r.chatRoomId === chatRoomId)
  // 모르는 방은 상대가 새로 시작했거나 서버가 나를 재입장시킨 방이다. 남아 있는 이력·보내는 중 표시는 이전 참여 때의
  // 것이라 버리고(열 때 새 조회 범위로 불러온다) 방 목록을 다시 받는다.
  if (!cached) {
    if (rooms) {
      queryClient.removeQueries({ queryKey: chatKeys.messages(chatRoomId) })
      clearRoomPending(chatRoomId)
    }
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
    return
  }
  const known = cached.lastMessage
  // 이미 반영한 묶음(방 목록 응답·이전 알림이 더 새롭다)
  if (known && known.roomSequence >= lastSequence) return
  const { myUserId, viewingRoomId } = useChatStore.getState()
  const unread =
    viewingRoomId === chatRoomId && isPageActive() ? 0 : messageCount
  activityCounted.set(
    chatRoomId,
    Math.max(activityCounted.get(chatRoomId) ?? 0, lastSequence),
  )
  if (isFetching(queryClient, chatKeys.rooms()))
    roomArrivals.push({
      message: lastMessage,
      unread,
      participationVersion: myVersionIn(cached, myUserId),
    })
  queryClient.setQueryData<ChatRoom[]>(chatKeys.rooms(), (list) =>
    list?.map((room) =>
      room.chatRoomId === chatRoomId
        ? {
            ...room,
            lastMessage,
            unreadCount:
              (room.unreadCount ?? 0) +
              newUnread(room.lastMessage, lastSequence, unread),
          }
        : room,
    ),
  )
  const senderRejoined = cached.members.some(
    (m) => m.userId === lastMessage.senderUserId && !m.active,
  )
  if (
    lastMessage.messageType === 'SYSTEM' ||
    lastMessage.messageType === 'NOTIFICATION' ||
    senderRejoined
  )
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
}

/**
 * 방 목록 캐시에서 이 방의 안 읽은 수를 0으로 (읽음 처리 직후).
 * 방 목록 조회 중에 보관한 이 방 메시지도 읽은 것으로 바꿔, 조회가 끝난 뒤 안 읽은 수에 다시 더하지 않는다.
 */
export function clearUnread(queryClient: QueryClient, chatRoomId: number) {
  roomArrivals = roomArrivals.map((a) =>
    a.message.chatRoomId === chatRoomId ? { ...a, unread: 0 } : a,
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
