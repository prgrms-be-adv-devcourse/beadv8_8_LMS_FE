import { issueNotificationTicket } from '@/entities/notification/api'
import type { NotificationConnectionTicket } from '@/entities/notification/types'
import { TOKEN_MIN_REMAINING_MS } from '@/features/chat/connectionAuth'
import { isApiError } from '@/shared/api/ApiError'
import {
  accessTokenRemainingMs,
  refreshAccessToken,
  serverNow,
} from '@/shared/auth/token'

/** 연결 만료까지 이보다 적게 남은 티켓은 쓰지 않는다(연결 직후 4401로 닫힌다) */
export const CONNECTION_MIN_LIFETIME_MS = 5_000

/**
 * 티켓 받기 결과
 * - signedOut: 토큰을 다시 받지 못했다(다시 로그인해야 함)
 * - forbidden: 알림을 받지 않는 회원(403, 관리자)
 * - retry: 잠시 뒤 다시 받는다(429 횟수 제한, 503 티켓 저장소 장애, 응답 없음, 토큰을 새로 받아도 곧 닫힐 연결)
 */
export type NotificationTicketResult =
  | { ok: true; ticket: NotificationConnectionTicket }
  | { ok: false; reason: 'signedOut' | 'forbidden' | 'retry' }

/** 이 티켓으로 연 연결이 곧바로 닫히는지. 시각을 읽지 못하면 쓴다(서버가 닫으면 다시 연결한다) */
function closesAtOnce(ticket: NotificationConnectionTicket) {
  const at = Date.parse(ticket.connectionExpiresAt)
  return !Number.isNaN(at) && at - serverNow() < CONNECTION_MIN_LIFETIME_MS
}

/**
 * 알림 연결에 쓸 일회용 티켓을 받는다. 채팅 티켓 받기(features/chat/connectionAuth.ts requestTicket)와 같이
 * access token이 60초보다 적게 남았으면 먼저 다시 받는다(서버가 연결 만료를 토큰 만료에 맞춘다).
 * 알림 연결은 재인증이 없어 4401로 닫히면 이 함수로 새 티켓을 받아 다시 연결한다.
 * 받은 connectionExpiresAt이 이미 지났으면(곧 지나면) 그 티켓은 버리고 토큰부터 새로 받아 한 번 더 받는다.
 * 티켓 요청이 401이면 api()가 이미 토큰을 다시 받아 한 번 더 보냈다. refresh token이 거절됐으면(sessionEnded)
 * 로그아웃으로 본다.
 */
export async function requestNotificationTicket(): Promise<NotificationTicketResult> {
  for (let renewed = false; ; renewed = true) {
    if (renewed || accessTokenRemainingMs() < TOKEN_MIN_REMAINING_MS) {
      const token = await refreshAccessToken().catch(() => undefined)
      if (token === null) return { ok: false, reason: 'signedOut' }
      // 새로 받아야 하는데 BE가 응답하지 않았다. 같은 토큰으로 받으면 또 곧 닫히므로 잠시 뒤 다시 받는다.
      if (renewed && token === undefined) return { ok: false, reason: 'retry' }
    }
    let ticket: NotificationConnectionTicket
    try {
      ticket = await issueNotificationTicket()
    } catch (error) {
      if (isApiError(error) && error.sessionEnded)
        return { ok: false, reason: 'signedOut' }
      if (isApiError(error) && error.status === 403)
        return { ok: false, reason: 'forbidden' }
      return { ok: false, reason: 'retry' }
    }
    if (!closesAtOnce(ticket)) return { ok: true, ticket }
    if (renewed) return { ok: false, reason: 'retry' }
  }
}
