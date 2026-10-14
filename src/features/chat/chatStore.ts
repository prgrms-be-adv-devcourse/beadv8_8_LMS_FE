import { create } from 'zustand'

export type ChatConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'disconnected'

type ChatState = {
  status: ChatConnectionStatus
  /** 보내기. 연결돼 있지 않으면 false */
  publish: (chatRoomId: number, content: string) => boolean
  /** 이번 접속 중 받은 알림으로 센 방별 안 읽은 수 (BE에 안 읽은 수가 없다) */
  unread: Record<number, number>
  /** 지금 보고 있는 방. 이 방의 알림은 안 읽은 수로 세지 않는다 */
  viewingRoomId: number | null
}

export const useChatStore = create<ChatState>(() => ({
  status: 'idle',
  publish: () => false,
  unread: {},
  viewingRoomId: null,
}))

export function markRoomRead(chatRoomId: number) {
  useChatStore.setState((s) => {
    if (!s.unread[chatRoomId]) return s
    const unread = { ...s.unread }
    delete unread[chatRoomId]
    return { unread }
  })
}

export function setViewingRoom(chatRoomId: number | null) {
  useChatStore.setState({ viewingRoomId: chatRoomId })
  if (chatRoomId !== null) markRoomRead(chatRoomId)
}

export function useUnreadTotal() {
  return useChatStore((s) =>
    Object.values(s.unread).reduce((sum, n) => sum + n, 0),
  )
}
