import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/entities/chat/api'
import type {
  ChatError,
  ChatMessage,
  ChatMessagePage,
  ChatNotification,
} from '@/entities/chat/types'
import { toast } from '@/shared/ui/toastStore'
import { useChatStore } from './chatStore'

/**
 * 실시간으로 받은 메시지를 그 방의 이력 캐시 맨 앞(최신)에 붙인다.
 * 이력을 아직 불러오지 않은 방은 건드리지 않는다(열 때 불러온다). 같은 메시지는 두 번 넣지 않는다.
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
  // 퇴장 안내(SYSTEM)는 참여 상태가 바뀐 것이고, 모르는 방의 메시지는 새 방(상대가 시작)이다.
  const rooms = queryClient.getQueryData<{ chatRoomId: number }[]>(
    chatKeys.rooms(),
  )
  if (
    message.messageType === 'SYSTEM' ||
    !rooms?.some((r) => r.chatRoomId === message.chatRoomId)
  ) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
  }
}

/** 새 메시지 알림. 지금 보고 있는 방이 아니면 안 읽은 수를 올린다. */
export function applyNotification(notification: ChatNotification) {
  useChatStore.setState((s) => {
    if (s.viewingRoomId === notification.chatRoomId) return s
    return {
      unread: {
        ...s.unread,
        [notification.chatRoomId]: (s.unread[notification.chatRoomId] ?? 0) + 1,
      },
    }
  })
}

/** 보내기 오류. 상대가 나간 방이면 방 상태를 다시 불러와 다시 시작 안내를 띄운다. */
export function applyChatError(queryClient: QueryClient, error: ChatError) {
  toast(error.message)
  if (
    error.code === 'CHAT_PARTNER_LEFT' ||
    error.code === 'NOT_CHAT_ROOM_MEMBER'
  ) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
  }
}
