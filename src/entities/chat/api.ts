import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { ChatMessagePage, ChatRoom } from './types'

export const chatKeys = {
  all: ['chat'] as const,
  rooms: () => [...chatKeys.all, 'rooms'] as const,
  messages: (chatRoomId: number) =>
    [...chatKeys.all, 'messages', chatRoomId] as const,
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

/** 1:1 방의 상대 (없으면 undefined) */
export function partnerOf(room: ChatRoom, myUserId: number | undefined) {
  return room.members.find((m) => m.userId !== myUserId)
}
