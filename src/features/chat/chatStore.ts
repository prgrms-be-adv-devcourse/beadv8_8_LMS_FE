import { create } from 'zustand'
import type { ChatMessage } from '@/entities/chat/types'

export type ChatConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'disconnected'

/** 보냈지만 아직 서버가 돌려주지 않은 메시지 */
export type PendingMessage = {
  clientMessageId: string
  content: string
  status: 'sending' | 'failed'
  /** 실패 이유 (failed일 때) */
  error?: string
}

type ChatState = {
  status: ChatConnectionStatus
  /** STOMP로 보내기. 연결돼 있지 않으면 false */
  publish: (
    chatRoomId: number,
    content: string,
    clientMessageId: string,
  ) => boolean
  /** 지금 보고 있는 방. 이 방에 온 메시지는 안 읽은 수로 세지 않고 바로 읽음 처리한다 */
  viewingRoomId: number | null
  /** 로그인한 회원. 내가 보낸 메시지인지 가릴 때 쓴다 */
  myUserId: number | null
  /** 방별 보내는 중·실패한 메시지 (보낸 순) */
  pending: Record<number, PendingMessage[]>
}

export const useChatStore = create<ChatState>(() => ({
  status: 'idle',
  publish: () => false,
  viewingRoomId: null,
  myUserId: null,
  pending: {},
}))

export function setViewingRoom(chatRoomId: number | null) {
  useChatStore.setState({ viewingRoomId: chatRoomId })
}

function updatePending(
  chatRoomId: number,
  update: (list: PendingMessage[]) => PendingMessage[],
) {
  useChatStore.setState((s) => {
    const next = update(s.pending[chatRoomId] ?? [])
    const pending = { ...s.pending }
    if (next.length) pending[chatRoomId] = next
    else delete pending[chatRoomId]
    return { pending }
  })
}

function newClientMessageId() {
  return crypto.randomUUID()
}

/**
 * 메시지를 보낸다. 서버가 같은 clientMessageId로 돌려줄 때까지 "보내는 중"으로 보여 준다.
 * 연결이 없으면 바로 실패로 표시해 다시 보낼 수 있게 한다.
 */
export function sendChatMessage(chatRoomId: number, content: string) {
  const clientMessageId = newClientMessageId()
  updatePending(chatRoomId, (list) => [
    ...list,
    { clientMessageId, content, status: 'sending' },
  ])
  const sent = useChatStore
    .getState()
    .publish(chatRoomId, content, clientMessageId)
  if (!sent) failPending(clientMessageId, '채팅 서버에 연결되지 않았어요.')
}

/** 실패한 메시지를 같은 내용으로 다시 보낸다(새 임시 ID) */
export function retryPending(chatRoomId: number, clientMessageId: string) {
  const target = useChatStore
    .getState()
    .pending[chatRoomId]?.find((p) => p.clientMessageId === clientMessageId)
  if (!target) return
  discardPending(chatRoomId, clientMessageId)
  sendChatMessage(chatRoomId, target.content)
}

export function discardPending(chatRoomId: number, clientMessageId: string) {
  updatePending(chatRoomId, (list) =>
    list.filter((p) => p.clientMessageId !== clientMessageId),
  )
}

/**
 * 서버가 돌려준 메시지로 보내는 중 표시를 지운다.
 * clientMessageId가 없는 응답(BE #197 이전)은 내가 보낸 같은 내용의 가장 오래된 것을 지운다.
 */
export function resolvePending(message: ChatMessage) {
  const { myUserId } = useChatStore.getState()
  updatePending(message.chatRoomId, (list) => {
    if (message.clientMessageId)
      return list.filter((p) => p.clientMessageId !== message.clientMessageId)
    if (message.senderUserId !== myUserId) return list
    const index = list.findIndex(
      (p) => p.status === 'sending' && p.content === message.content,
    )
    return index < 0 ? list : list.filter((_, i) => i !== index)
  })
}

export function failPending(clientMessageId: string, error: string) {
  useChatStore.setState((s) => {
    const pending: Record<number, PendingMessage[]> = {}
    for (const [roomId, list] of Object.entries(s.pending)) {
      pending[Number(roomId)] = list.map((p) =>
        p.clientMessageId === clientMessageId
          ? { ...p, status: 'failed', error }
          : p,
      )
    }
    return { pending }
  })
}

/** 연결이 끊기면 보내는 중이던 메시지의 결과를 알 수 없으므로 실패로 바꿔 다시 보내기를 맡긴다. */
export function failAllSending() {
  useChatStore.setState((s) => {
    const pending: Record<number, PendingMessage[]> = {}
    for (const [roomId, list] of Object.entries(s.pending)) {
      pending[Number(roomId)] = list.map((p) =>
        p.status === 'sending'
          ? {
              ...p,
              status: 'failed',
              error:
                '연결이 끊겨 전송 여부를 확인하지 못했어요. 대화에 없으면 다시 보내 주세요.',
            }
          : p,
      )
    }
    return { pending }
  })
}
