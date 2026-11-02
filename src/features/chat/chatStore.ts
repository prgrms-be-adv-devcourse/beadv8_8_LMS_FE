import { create } from 'zustand'
import type { ChatMessage } from '@/entities/chat/types'
import { RECEIPT_POLICY } from './receipt/policy'
import { createSendGate } from './sendGate'

export type ChatConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'disconnected'

/**
 * 보냈지만 아직 서버가 돌려주지 않은 메시지
 * - sending: 보내고 서버 응답(같은 clientMessageId)을 기다리는 중
 * - failed: 서버가 거절했거나 보내지 못했다(실패 확정)
 * - unconfirmed: 응답이 없고 이력에서도 확인하지 못했다(결과 미확인). 저장됐을 수도 있어 실패로 단정하지 않는다
 */
export type PendingMessage = {
  clientMessageId: string
  content: string
  status: 'sending' | 'failed' | 'unconfirmed'
  /** 실패·미확인 이유 (failed·unconfirmed일 때) */
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
  /**
   * 채팅 연결이 관측한 방별 가장 높은 참여 세대(방 목록·이력·실시간). 화면 캐시보다 먼저 오를 수 있다.
   * 연결이 없으면 undefined
   */
  generationOf: (chatRoomId: number) => number | undefined
}

export const useChatStore = create<ChatState>(() => ({
  status: 'idle',
  publish: () => false,
  viewingRoomId: null,
  myUserId: null,
  pending: {},
  generationOf: () => undefined,
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

/** 보낸 메시지의 결과 확인을 맡는 함수(installSendConfirm). 채팅 연결이 있는 동안만 등록한다 */
type SendWatcher = (chatRoomId: number, clientMessageId: string) => void
let sendWatcher: SendWatcher | null = null

/** 보내기에 성공할 때마다(다시 보내기 포함) 불릴 함수를 등록한다. null이면 해제 */
export function setSendWatcher(fn: SendWatcher | null) {
  sendWatcher = fn
}

/**
 * 서버 결과를 기다리는 전송의 동시 상한(서버가 연결당 처리 대기 프레임 수를 제한한다). 새 메시지와 다시 보내기 모두 맡긴 순서대로 따른다.
 * 자리를 기다리는 메시지도 화면에는 보내는 중으로 보인다.
 */
const sendGate = createSendGate(RECEIPT_POLICY.send.maxInFlight)

// 결과가 나와(서버 응답·실패·결과 미확인·지우기) 보내는 중이 아니게 된 전송은 자리를 비우고,
// 자리를 기다리던 것은 보내지 않고 버린다(연결이 끊기면 결과 미확인으로 바뀌어 함께 버려진다).
useChatStore.subscribe((state, prev) => {
  if (state.pending === prev.pending) return
  const sending = new Set<string>()
  for (const list of Object.values(state.pending))
    for (const p of list)
      if (p.status === 'sending') sending.add(p.clientMessageId)
  sendGate.retain((id) => sending.has(id))
})

/** 보낸 전송의 결과를 이력에서 확인했다(보내는 중 표시가 남아도 서버는 처리했다). 다음 전송에 자리를 넘긴다 */
export function settleSend(clientMessageId: string) {
  sendGate.settle(clientMessageId)
}

/** 보내고 서버 결과를 기다리는 중인지. 자리를 기다리는 메시지는 아직 보내지 않았으므로 false */
export function isAwaitingResult(clientMessageId: string) {
  return sendGate.isInFlight(clientMessageId)
}

/** 자리가 나면 STOMP로 보낸다. 보냈으면 결과 확인을 맡기고, 연결이 없으면 실패로 표시한다 */
function publishPending(
  chatRoomId: number,
  content: string,
  clientMessageId: string,
) {
  sendGate.submit(clientMessageId, () => {
    const sent = useChatStore
      .getState()
      .publish(chatRoomId, content, clientMessageId)
    if (sent) sendWatcher?.(chatRoomId, clientMessageId)
    else failPending(clientMessageId, '채팅 서버에 연결되지 않았어요.')
    return sent
  })
}

/**
 * 메시지를 보낸다. 서버가 같은 clientMessageId로 돌려줄 때까지 "보내는 중"으로 보여 준다.
 * 연결이 없으면 바로 실패로 표시해 다시 보낼 수 있게 한다.
 * 응답이 오래 없으면 결과 확인(installSendConfirm)이 이력에서 찾아 보고 성공 또는 결과 미확인으로 바꾼다.
 */
export function sendChatMessage(chatRoomId: number, content: string) {
  const clientMessageId = newClientMessageId()
  updatePending(chatRoomId, (list) => [
    ...list,
    { clientMessageId, content, status: 'sending' },
  ])
  publishPending(chatRoomId, content, clientMessageId)
}

/**
 * 실패·결과 미확인 메시지를 같은 임시 ID로 다시 보낸다. 사실은 저장됐는데 응답만 놓친 경우 서버가 새로 저장하지 않고
 * 기존 메시지를 같은 clientMessageId로 돌려주므로(BE #261) 두 번 보내지지 않는다.
 */
export function retryPending(chatRoomId: number, clientMessageId: string) {
  const target = useChatStore
    .getState()
    .pending[chatRoomId]?.find((p) => p.clientMessageId === clientMessageId)
  if (!target) return
  updatePending(chatRoomId, (list) =>
    list.map((p) =>
      p.clientMessageId === clientMessageId
        ? { clientMessageId, content: p.content, status: 'sending' }
        : p,
    ),
  )
  publishPending(chatRoomId, target.content, clientMessageId)
}

/** 이 방의 보내는 중·실패 표시를 모두 지운다(나가기·재입장으로 참여가 바뀌어 이전 참여 때의 것이 의미 없을 때) */
export function clearRoomPending(chatRoomId: number) {
  updatePending(chatRoomId, () => [])
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

/**
 * 서버에 저장된 내 메시지(이력·방 목록의 clientMessageId)와 같은 임시 ID의 보내는 중·실패 표시를 지운다.
 * 재연결 등으로 응답을 놓쳤어도 저장된 메시지는 성공으로 정리된다.
 */
export function resolvePendingByIds(
  chatRoomId: number,
  clientMessageIds: ReadonlySet<string>,
) {
  if (clientMessageIds.size === 0) return
  if (!useChatStore.getState().pending[chatRoomId]) return
  updatePending(chatRoomId, (list) =>
    list.filter((p) => !clientMessageIds.has(p.clientMessageId)),
  )
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

/**
 * 보내는 중인 메시지를 결과 미확인으로 바꾼다(응답이 없고 이력에서도 찾지 못했을 때).
 * 실패 확정이 아니므로 같은 임시 ID로 다시 보내게 한다. 이미 정리됐거나 보내는 중이 아니면 그대로 둔다.
 */
export function markUnconfirmed(clientMessageId: string, reason?: string) {
  useChatStore.setState((s) => {
    const pending: Record<number, PendingMessage[]> = {}
    for (const [roomId, list] of Object.entries(s.pending)) {
      pending[Number(roomId)] = list.map((p) =>
        p.clientMessageId === clientMessageId && p.status === 'sending'
          ? { ...p, status: 'unconfirmed', error: reason }
          : p,
      )
    }
    return { pending }
  })
}

/**
 * 연결이 끊기면 보내는 중이던 메시지의 결과를 알 수 없으므로 결과 미확인으로 바꿔 다시 보내기를 맡긴다.
 * 저장됐을 수 있어 실패로 단정하지 않는다(다시 연결되면 이력에서 찾아 정리된다).
 */
export function failAllSending() {
  useChatStore.setState((s) => {
    const pending: Record<number, PendingMessage[]> = {}
    for (const [roomId, list] of Object.entries(s.pending)) {
      pending[Number(roomId)] = list.map((p) =>
        p.status === 'sending'
          ? {
              ...p,
              status: 'unconfirmed',
              error:
                '연결이 끊겨 전송 여부를 확인하지 못했어요. 다시 연결되면 저장된 메시지는 자동으로 정리되고, 다시 보내도 두 번 보내지지 않아요.',
            }
          : p,
      )
    }
    return { pending }
  })
}
