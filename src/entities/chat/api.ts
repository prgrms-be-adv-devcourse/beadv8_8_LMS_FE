import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { ChatMessagePage, ChatRoom, ChatRoomHistory } from './types'

export const chatKeys = {
  all: ['chat'] as const,
  rooms: () => [...chatKeys.all, 'rooms'] as const,
  messages: (chatRoomId: number) =>
    [...chatKeys.all, 'messages', chatRoomId] as const,
  history: (chatRoomId: number) =>
    [...chatKeys.all, 'history', chatRoomId] as const,
}

export const CHAT_PAGE_SIZE = 30

/** 내 채팅방 (참여 중인 방) */
export const chatRoomsQuery = queryOptions({
  queryKey: chatKeys.rooms(),
  queryFn: ({ signal }) => api<ChatRoom[]>('/chats', { signal }),
})

/**
 * 서버가 돌려준 이력 한 페이지를 지켜보는 함수. cursor는 그 페이지를 요청한 커서(최신 페이지면 null).
 * false를 돌려주면(옛 참여 세대의 응답) 그 페이지를 캐시에 넣지 않고 조회를 실패시킨다(다시 시도하면 새 세대로 받는다).
 */
export type ChatPageObserver = (
  chatRoomId: number,
  page: ChatMessagePage,
  cursor: number | null,
  /** 이 조회의 취소 신호. 관찰자는 조회가 끝까지 반영됐는지 판단할 때 쓴다 */
  signal: AbortSignal,
) => boolean

/** 옛 참여 세대의 이력 응답. 캐시에 넣지 않는다 */
export class StaleChatPageError extends Error {
  constructor() {
    super('채팅 참여 상태가 바뀌어 대화를 다시 불러와요.')
    this.name = 'StaleChatPageError'
  }
}

let pageObserver: ChatPageObserver | null = null

/**
 * 이력 응답을 받을 때마다 부를 함수를 정한다(채팅 연결이 수신 확인 구간을 기록한다). 돌려준 함수로 그만 듣는다.
 * 화면이 합치는 실시간 메시지와 섞이기 전의 서버 응답 그대로를 넘긴다.
 */
export function observeChatPages(observer: ChatPageObserver) {
  pageObserver = observer
  return () => {
    if (pageObserver === observer) pageObserver = null
  }
}

/**
 * 메시지 이력. 페이지는 최신순이고 다음 페이지가 더 오래된 메시지다.
 * 내가 볼 수 있는 범위(재입장 이후 등)는 BE가 정한다.
 */
export const chatMessagesQuery = (chatRoomId: number) =>
  infiniteQueryOptions({
    queryKey: chatKeys.messages(chatRoomId),
    queryFn: async ({ pageParam, signal }) => {
      // 요청을 보낸 때의 관찰자(그 회원의 채팅 연결)에만 알린다. 그사이 회원이 바뀌었거나 조회가 취소됐으면
      // 늦게 온 응답을 새 회원의 수신 상태에 기록하지 않는다.
      const observer = pageObserver
      const page = await api<ChatMessagePage>(`/chats/${chatRoomId}/messages`, {
        query: { cursor: pageParam ?? undefined, size: CHAT_PAGE_SIZE },
        signal,
      })
      if (observer && observer === pageObserver && !signal.aborted) {
        if (!observer(chatRoomId, page, pageParam, signal))
          throw new StaleChatPageError()
      }
      return page
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/** 관리자 분쟁 확인용 기록(오래된 쪽부터 페이지). 종료된 방, 숨겨진·삭제된 메시지도 포함한다 */
export const CHAT_HISTORY_PAGE_SIZE = 50

export const chatHistoryQuery = (chatRoomId: number) =>
  infiniteQueryOptions({
    queryKey: chatKeys.history(chatRoomId),
    queryFn: ({ pageParam }) =>
      api<ChatRoomHistory>(`/chats/admin/${chatRoomId}/history`, {
        query: { cursor: pageParam ?? undefined, size: CHAT_HISTORY_PAGE_SIZE },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/**
 * 1:1 채팅 시작. 활성 방이 있으면 그 방을 돌려주고(상대가 나갔으면 바로 재입장), 없으면 새로 만든다.
 */
export function startChat(targetUserId: number) {
  return api<ChatRoom>('/chats', { method: 'POST', body: { targetUserId } })
}

/** 방 나가기. 이미 나갔거나 옛 참여 세대 요청이어도 성공(204) */
export function leaveChatRoom(
  chatRoomId: number,
  participationVersion: number,
) {
  return api<void>(`/chats/${chatRoomId}/members/me`, {
    method: 'DELETE',
    query: { participationVersion },
  })
}

/**
 * 이 순번까지 읽었다고 알린다. 서버는 줄이지 않고 방의 마지막 순번을 넘기지 않는다.
 * participationVersion(이력 응답의 참여 세대)을 함께 보내면 현재 세대와 같을 때만 반영하고, 다르면
 * 409 STALE_PARTICIPATION이다(BE 읽음 위치 계약). 지연 도착한 옛 세대 요청이 새 세대 읽음 위치를 올리지 않게 항상 보낸다.
 */
export function markChatRoomRead(
  chatRoomId: number,
  lastReadSequence: number,
  participationVersion?: number,
) {
  return api<void>(`/chats/${chatRoomId}/read`, {
    method: 'PUT',
    body:
      participationVersion === undefined
        ? { lastReadSequence }
        : { lastReadSequence, participationVersion },
  })
}

/** 방 목록 정렬: 최근 메시지가 있는 방부터(BE는 방 ID 내림차순). 메시지가 없으면 만든 시각 */
export function sortRoomsByRecent<T extends ChatRoom>(rooms: T[]): T[] {
  const at = (r: ChatRoom) => r.lastMessage?.sentAt ?? r.createdAt
  return [...rooms].sort((a, b) => at(b).localeCompare(at(a)))
}

/**
 * 이력 페이지들을 화면에 그릴 순서(오래된 순, roomSequence 오름차순)로 펼친다. 같은 메시지는 한 번만.
 * 실시간 메시지는 순서가 뒤바뀌어 올 수 있어 페이지 순서에 기대지 않고 순번으로 정렬한다.
 */
export function orderedMessages<
  T extends { messageId: number; roomSequence: number },
>(pages: { messages: T[] }[]): T[] {
  const byId = new Map<number, T>()
  for (const page of pages)
    for (const m of page.messages)
      if (!byId.has(m.messageId)) byId.set(m.messageId, m)
  return [...byId.values()].sort((a, b) => a.roomSequence - b.roomSequence)
}

/** 1:1 방의 상대 (없으면 undefined) */
export function partnerOf(room: ChatRoom, myUserId: number | undefined) {
  return room.members.find((m) => m.userId !== myUserId)
}
