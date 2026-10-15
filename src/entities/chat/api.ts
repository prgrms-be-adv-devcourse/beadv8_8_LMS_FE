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
  queryFn: () => api<ChatRoom[]>('/chats'),
})

/**
 * 메시지 이력. 페이지는 최신순이고 다음 페이지가 더 오래된 메시지다.
 * 내가 볼 수 있는 범위(재입장 이후 등)는 BE가 정한다.
 */
export const chatMessagesQuery = (chatRoomId: number) =>
  infiniteQueryOptions({
    queryKey: chatKeys.messages(chatRoomId),
    queryFn: ({ pageParam }) =>
      api<ChatMessagePage>(`/chats/${chatRoomId}/messages`, {
        query: { cursor: pageParam ?? undefined, size: CHAT_PAGE_SIZE },
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/** 관리자 분쟁 확인용 전체 기록. 종료된 방, 숨겨진·삭제된 메시지도 포함한다 */
export const chatHistoryQuery = (chatRoomId: number) =>
  queryOptions({
    queryKey: chatKeys.history(chatRoomId),
    queryFn: () => api<ChatRoomHistory>(`/chats/admin/${chatRoomId}/history`),
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

/** 이 순번까지 읽었다고 알린다. 서버는 줄이지 않고 방의 마지막 순번을 넘기지 않는다 */
export function markChatRoomRead(chatRoomId: number, lastReadSequence: number) {
  return api<void>(`/chats/${chatRoomId}/read`, {
    method: 'PUT',
    body: { lastReadSequence },
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
