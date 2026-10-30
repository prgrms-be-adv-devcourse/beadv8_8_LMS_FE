import type { ChatMessage } from '@/entities/chat/types'
import { isApiError } from '@/shared/api/ApiError'
import { api } from '@/shared/api/client'
import { RECEIPT_POLICY } from './policy'

/**
 * BE와 맞춘 수신 확인·재동기화 계약(Q11). BE `apps/chat-app/docs/contracts/receipt-ack.md`(d)·`resync-frame.md`(e).
 * - ACK: AckTransport (REST `PUT /chats/{id}/received`)
 * - 재동기화 신호: `/user/queue/chats/sync` 프레임
 * - 실시간 메시지의 수신자 참여 세대: STOMP 헤더 `participation-version`
 * - 실시간 전달: 열어 둔 방은 방 topic, 그 밖의 방은 새 메시지 알림(ROOM_ACTIVITY), 내가 보낸 메시지의 결과는 회원 큐
 */

/** 논리 ACK 요청(BE final-design 4.4): 사용자 ID는 서버가 인증 정보에서 얻는다 */
export type ReceiptAck = {
  chatRoomId: number
  participationVersion: number
  /** 이 기기가 빠짐없이 수신·반영한 누적 위치 */
  receivedSequence: number
}

/**
 * ACK 결과
 * - ok: 서버가 반영했거나 이미 그 이상이다(확정)
 * - stale: 옛 참여 세대·참여 아님·방 없음. 다시 보내지 않고 그 방의 이전 세대 상태(확인 위치·이력·보내는 중 표시)를
 *   버리고 재동기화한다
 * - resync: 범위 밖(RECEIVED_SEQUENCE_OUT_OF_RANGE). 세대는 그대로라 보내는 중 표시는 두고, 확인 위치를 버리고 재동기화한다
 * - retry: 실패·응답 유실. 같은 세대의 최신 값으로 제한해 다시 보낸다
 * - drop: 다시 보내도 소용없는 거절(형식 오류·채팅 불가). 버린다
 */
export type AckResult = 'ok' | 'stale' | 'resync' | 'retry' | 'drop'

export type AckTransport = {
  /** signal이 취소되면(대기열 폐기·로그아웃) 진행 중인 요청을 끊는다 */
  send: (ack: ReceiptAck, signal?: AbortSignal) => Promise<AckResult>
}

/** 다시 보내지 않고 그 방을 다시 맞추는 오류 */
const STALE_CODES = new Set([
  'STALE_PARTICIPATION',
  'NOT_CHAT_ROOM_MEMBER',
  'CHAT_ROOM_NOT_FOUND',
])

/** ACK 실패를 결과로 바꾼다. 응답이 없거나(네트워크) 5xx면 다시 보낸다 */
export function ackResultOf(error: unknown): AckResult {
  if (!isApiError(error)) return 'retry'
  if (STALE_CODES.has(error.code)) return 'stale'
  if (error.code === 'RECEIVED_SEQUENCE_OUT_OF_RANGE') return 'resync'
  if (error.status >= 500) return 'retry'
  // INVALID_REQUEST·CHAT_NOT_ALLOWED와 401(전역 인증 처리)·그 밖의 4xx
  return 'drop'
}

/**
 * `PUT /chats/{chatRoomId}/received` `{ participationVersion, receivedSequence }`.
 * 응답의 lastReceivedSequence(서버 회원 커서, 다른 기기 값일 수 있음)는 이 기기의 확인 위치로 쓰지 않는다.
 * 응답이 timeoutMs 안에 끝나지 않으면 요청을 끊고 응답 유실(retry)로 본다. 끊은 뒤 늦게 온 응답은 무시된다.
 */
export function createRestAckTransport(
  timeoutMs: number = RECEIPT_POLICY.ack.requestTimeoutMs,
): AckTransport {
  return {
    send: ({ chatRoomId, participationVersion, receivedSequence }, signal) =>
      new Promise<AckResult>((resolve) => {
        const controller = new AbortController()
        // 대기열이 폐기되면(로그아웃·회원 전환) CSRF 토큰 받기부터 끊는다. 다른 회원 세션으로 PUT이 나가지 않게.
        const abort = () => controller.abort()
        if (signal?.aborted) abort()
        signal?.addEventListener('abort', abort, { once: true })
        // 끝나면(성공·실패·시간 초과) 오래 사는 대기열 신호에 붙인 리스너를 뗀다(ACK마다 쌓이지 않게).
        const finish = (result: AckResult) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          resolve(result)
        }
        // CSRF 토큰을 먼저 받는 단계(`/members/me`)까지 포함해 시간 상한을 둔다. 먼저 끝난 쪽만 결과가 된다.
        const timer = setTimeout(() => {
          controller.abort()
          finish('retry')
        }, timeoutMs)
        api(`/chats/${chatRoomId}/received`, {
          method: 'PUT',
          body: { participationVersion, receivedSequence },
          signal: controller.signal,
        })
          .then(
            (): AckResult => 'ok',
            (error) => ackResultOf(error),
          )
          .then(finish)
      }),
  }
}

export const restAckTransport = createRestAckTransport()

/** 재동기화 신호 큐. 모르는 reason도 재동기화로 처리한다 */
export const SYNC_QUEUE = '/user/queue/chats/sync'

export function isResyncSignal(body: unknown) {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { type?: unknown }).type === 'RESYNC'
  )
}

/** 실시간 메시지 프레임에서 읽은 전달 메타데이터 */
export type DeliveryMeta = {
  /** 이 메시지를 받은 수신자(나)의 참여 세대. 서버가 주지 않으면 undefined */
  participationVersion?: number
}

/**
 * STOMP 프레임 헤더에서 전달 메타데이터를 읽는다. 값은 그 수신자의 메시지 저장 당시 참여 세대다.
 * 헤더가 없으면(전환 전 서버) 세대 검사를 건너뛴다.
 */
export const PARTICIPATION_VERSION_HEADER = 'participation-version'

export function readDeliveryMeta(
  headers: Record<string, string> | undefined,
): DeliveryMeta {
  const raw = headers?.[PARTICIPATION_VERSION_HEADER]?.trim()
  // 빈 값을 세대 0으로 읽어 프레임을 버리지 않게 한다.
  const value = raw ? Number(raw) : NaN
  return Number.isInteger(value) ? { participationVersion: value } : {}
}

/**
 * 열어 둔 방의 실시간 구독(방 topic). SUBSCRIBE에 내 참여 세대 헤더(participation-version)를 붙인다.
 * 같은 구독으로 그 방의 새 메시지와, 그 세션에만 구독 거절·회수 프레임이 온다(헤더 chat-frame-type으로 구분).
 * 구독 성공 프레임은 없다(거절이 오지 않으면 성공). 구독 직전·직후에 저장된 메시지는 빠질 수 있어 주기 대조·순번 간격·
 * 재동기화가 메운다
 */
export const roomTopic = (chatRoomId: number) =>
  `/topic/chats/rooms/${chatRoomId}`

export const CHAT_FRAME_TYPE_HEADER = 'chat-frame-type'

/** 방 topic 구독을 서버가 받지 않았다(연결은 유지된다) */
export const SUBSCRIPTION_REJECTED = 'SUBSCRIPTION_REJECTED'
/** 서버가 방 topic 구독을 지웠다(나가기·내보내기·세대 바뀜·방 닫힘). 이후 그 구독으로 온 메시지는 적용하지 않는다 */
export const SUBSCRIPTION_REVOKED = 'SUBSCRIPTION_REVOKED'

/** 구독 거절·회수 사유. 모르는 사유는 재동기화로 처리한다 */
export const SUBSCRIPTION_REASONS = new Set([
  'NOT_MEMBER',
  'STALE_PARTICIPATION',
  'ROOM_NOT_FOUND',
  'CHAT_NOT_ALLOWED',
  'TOO_MANY_SUBSCRIPTIONS',
  /** 서버가 방 채널 상한에 닿았다. 실시간 없이 쓰다가 잠시 뒤 한 번 다시 구독한다 */
  'SERVER_BUSY',
  'LEFT',
  'REMOVED',
  'ROOM_CLOSED',
])

/** 구독 거절·회수 프레임 본문. currentParticipationVersion은 세대가 맞지 않을 때 서버가 아는 내 현재 세대(선택) */
export type SubscriptionEnd = {
  type: string
  roomId: number
  reason: string
  currentParticipationVersion?: number
}

/**
 * 새 메시지 알림 큐. 그 방 topic을 구독하지 않은 세션에 방별로 묶어(잠정 1초) 보낸다. 보낸 사람에게는 오지 않는다.
 * 메시지 전체가 아니므로 수신 확인(ACK)의 근거로 쓰지 않는다
 */
export const NOTIFICATIONS_QUEUE = '/user/queue/chats/notifications'

export type RoomActivity = {
  type: 'ROOM_ACTIVITY'
  chatRoomId: number
  /** 그 메시지들을 받은 내 참여 세대 */
  participationVersion: number
  /** 묶은 메시지 가운데 가장 큰 방 순번 */
  lastSequence: number
  /** 묶은 메시지 수 */
  messageCount: number
  lastMessage: ChatMessage
}

export function isRoomActivity(body: unknown): body is RoomActivity {
  if (typeof body !== 'object' || body === null) return false
  const activity = body as Partial<RoomActivity>
  return (
    activity.type === 'ROOM_ACTIVITY' &&
    Number.isInteger(activity.chatRoomId) &&
    Number.isInteger(activity.lastSequence) &&
    Number.isInteger(activity.messageCount) &&
    typeof activity.lastMessage === 'object' &&
    activity.lastMessage !== null
  )
}

/** 채팅 연결이 쓰는 ACK 전송. 테스트는 연결을 맺기 전에 바꾸고 끝나면 되돌린다 */
export const receiptTransports: { ack: AckTransport } = {
  ack: restAckTransport,
}
