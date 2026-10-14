import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/entities/chat/api'
import type {
  ChatError,
  ChatMessage,
  ChatMessagePage,
  ChatRoom,
} from '@/entities/chat/types'
import { toast } from '@/shared/ui/toastStore'
import { failPending, resolvePending, useChatStore } from './chatStore'

/**
 * 실시간으로 받은 메시지(/user/queue/chats/messages)를 반영한다. 보낸 사람 자신에게도 온다.
 * - 그 방의 이력 캐시 맨 앞(최신)에 붙인다. 이력을 아직 불러오지 않은 방은 열 때 불러온다
 * - 내가 보낸 것이면 보내는 중 표시를 지운다
 * - 방 목록 캐시의 마지막 메시지를 바꾸고, 보고 있지 않은 방에 상대가 보낸 것이면 안 읽은 수를 올린다
 */
export function applyIncomingMessage(
  queryClient: QueryClient,
  message: ChatMessage,
) {
  queryClient.setQueryData<InfiniteData<ChatMessagePage, number | null>>(
    chatKeys.messages(message.chatRoomId),
    (data) => {
      if (!data) return data
      const exists = data.pages.some((page) =>
        page.messages.some((m) => m.messageId === message.messageId),
      )
      if (exists) return data
      const [first, ...rest] = data.pages
      return {
        ...data,
        pages: [{ ...first, messages: [message, ...first.messages] }, ...rest],
      }
    },
  )
  resolvePending(message)

  const { myUserId, viewingRoomId } = useChatStore.getState()
  const countsAsUnread =
    message.senderUserId !== myUserId && viewingRoomId !== message.chatRoomId
  const rooms = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())
  const cached = rooms?.find((r) => r.chatRoomId === message.chatRoomId)
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
  if (message.messageType === 'SYSTEM' || !cached || senderRejoined) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
  }
}

/** 방 목록 캐시에서 이 방의 안 읽은 수를 0으로 (읽음 처리 직후) */
export function clearUnread(queryClient: QueryClient, chatRoomId: number) {
  queryClient.setQueryData<ChatRoom[]>(chatKeys.rooms(), (list) =>
    list?.map((room) =>
      room.chatRoomId === chatRoomId ? { ...room, unreadCount: 0 } : room,
    ),
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
