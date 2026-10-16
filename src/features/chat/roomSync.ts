import type { QueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/entities/chat/api'
import { clearRoomPending, useChatStore } from './chatStore'

/**
 * 이 방의 참여가 바뀌었다(나가기·다시 시작·재입장). 이전 참여 때의 이력 캐시와 보내는 중·실패 표시를 버리고
 * 방 목록을 다시 부른다. 이력은 새 조회 범위로 다시 불러온다.
 */
export function forgetRoom(queryClient: QueryClient, chatRoomId: number) {
  discardRoomState(queryClient, chatRoomId)
  return queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
}

/** 이 방의 이력 캐시와 보내는 중·실패 표시만 버린다(방 목록은 부르는 쪽이 다시 부른다) */
export function discardRoomState(queryClient: QueryClient, chatRoomId: number) {
  queryClient.removeQueries({ queryKey: chatKeys.messages(chatRoomId) })
  clearRoomPending(chatRoomId)
}

// ── 탭 간 채팅 참여 동기화 ──
// 한 탭에서 나가거나 다시 시작해도 다른 탭은 이전 참여의 이력·보내는 중 표시·참여 세대(participationVersion)를
// 그대로 쓴다. 로그아웃 동기화(hapbang.auth)와 채널을 나눈다: 로그인한 동안 채팅 연결과 함께만 듣고,
// 메시지 형식도 채팅에만 쓰인다.

const CHAT_CHANNEL = 'hapbang.chat'
type ChatSyncMessage = {
  type: 'chat-room-changed'
  chatRoomId: number
  /** 보낸 탭의 회원. 다른 회원으로 바뀐 탭이면 무시한다 */
  userId: number | null
}

/**
 * 이 탭이 듣고 있는 채널. 보낼 때도 같은 객체를 쓴다.
 * BroadcastChannel은 보낸 객체에만 전달하지 않으므로, 같은 객체로 보내면 보낸 탭 자신은 받지 않는다.
 */
let listening: BroadcastChannel | null = null

/**
 * 다른 탭에 이 방의 참여가 바뀌었다고 알린다.
 * userId는 요청을 보낸 회원이다(응답을 기다리는 동안 회원이 바뀌어도 다른 회원 이름으로 알리지 않게).
 */
export function broadcastRoomChanged(chatRoomId: number, userId: number) {
  if (typeof BroadcastChannel === 'undefined') return
  const message: ChatSyncMessage = {
    type: 'chat-room-changed',
    chatRoomId,
    userId,
  }
  if (listening) {
    listening.postMessage(message)
    return
  }
  const channel = new BroadcastChannel(CHAT_CHANNEL)
  channel.postMessage(message)
  channel.close()
}

/**
 * 다른 탭에서 방 참여가 바뀌면 이 탭도 그 방의 이력·보내는 중 표시를 버리고 방 목록을 다시 부른다.
 * 채팅 연결과 함께 듣고, 돌려준 함수로 그만 듣는다.
 */
export function listenRoomChanges(queryClient: QueryClient) {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const channel = new BroadcastChannel(CHAT_CHANNEL)
  channel.onmessage = (e: MessageEvent<ChatSyncMessage>) => {
    if (e.data?.type !== 'chat-room-changed') return
    if (e.data.userId !== useChatStore.getState().myUserId) return
    void forgetRoom(queryClient, e.data.chatRoomId)
  }
  listening = channel
  return () => {
    channel.close()
    if (listening === channel) listening = null
  }
}
