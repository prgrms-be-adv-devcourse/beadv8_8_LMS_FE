import { issueConnectionTicket } from '@/entities/chat/api'
import type {
  ChatConnectionTicket,
  ChatReauthFrame,
} from '@/entities/chat/types'
import { isApiError } from '@/shared/api/ApiError'
import {
  accessTokenRemainingMs,
  refreshAccessToken,
  serverNow,
} from '@/shared/auth/token'

/**
 * 티켓을 받기 전에 access token이 이보다 적게 남았으면 먼저 다시 받는다. 만료 직전 토큰으로 받은 티켓의 연결은
 * 곧바로 4401로 닫힌다(서버가 연결 만료를 토큰 만료에 맞춘다)
 */
export const TOKEN_MIN_REMAINING_MS = 60_000
/** 연결 만료 이만큼 전에 재인증한다 */
export const REAUTH_BEFORE_MS = 60_000
/** 만료까지 이보다 적게 남았으면 재인증하지 않는다(서버가 처리하기 전에 만료되면 그 프레임은 4401로 닫힌다) */
export const REAUTH_MIN_LEAD_MS = 5_000

/** 다시 연결·다시 받기 대기: 3초부터 두 배씩 늘려 최대 30초. 여러 탭·회원이 한꺼번에 몰리지 않게 매번 최대 1초를 더 기다린다 */
export const RECONNECT = { baseMs: 3_000, maxMs: 30_000, jitterMs: 1_000 }

/** 티켓을 받지 못했을 때 다시 받기까지 기다리는 시간(재연결과 같은 backoff·jitter) */
export function ticketRetryDelay(failures: number) {
  return (
    Math.min(RECONNECT.baseMs * 2 ** failures, RECONNECT.maxMs) +
    Math.random() * RECONNECT.jitterMs
  )
}

/**
 * 티켓 받기 결과
 * - signedOut: 토큰을 다시 받지 못했다(다시 로그인해야 함)
 * - forbidden: 채팅을 쓸 수 없는 회원(403)
 * - retry: 잠시 뒤 다시 받는다(429 횟수 제한, 503 서버 장애, 응답 없음)
 */
export type TicketResult =
  | { ok: true; ticket: ChatConnectionTicket }
  | { ok: false; reason: 'signedOut' | 'forbidden' | 'retry' }

/**
 * 연결·재인증에 쓸 일회용 티켓을 받는다. access token이 minTokenMs보다 적게 남았으면 먼저 다시 받는다
 * (서버는 연결 만료를 토큰 만료에 맞추므로, 남은 토큰이 짧으면 연결도 짧다).
 * 티켓 요청이 401이면 api()가 이미 토큰을 다시 받아 한 번 더 보냈다. refresh token이 거절됐으면(sessionEnded)
 * 로그아웃으로 보고, 다시 받은 토큰으로도 401이면 잠시 뒤 다시 받는다.
 */
export async function requestTicket({
  minTokenMs = TOKEN_MIN_REMAINING_MS,
}: { minTokenMs?: number } = {}): Promise<TicketResult> {
  if (accessTokenRemainingMs() < minTokenMs) {
    const token = await refreshAccessToken().catch(() => undefined)
    if (token === null) return { ok: false, reason: 'signedOut' }
  }
  try {
    return { ok: true, ticket: await issueConnectionTicket() }
  } catch (error) {
    if (isApiError(error) && error.sessionEnded)
      return { ok: false, reason: 'signedOut' }
    if (isApiError(error) && error.status === 403)
      return { ok: false, reason: 'forbidden' }
    return { ok: false, reason: 'retry' }
  }
}

/**
 * 열린 연결의 재인증(연결을 끊지 않고 만료만 늦춘다). 연결 만료 60초 전에 새 티켓을 받아 보내고, 결과
 * (`/user/queue/chats/connection`)로 다음 재인증을 잡는다.
 * - 재인증 티켓은 지금 연결 만료보다 60초 넘게 남는 토큰으로 받는다(아니면 먼저 다시 받는다). 같은 만료의 티켓으로
 *   재인증하면 만료가 늘지 않아 곧바로 다시 재인증하게 된다
 * - 티켓을 받지 못하면(429·503·응답 없음) 재연결과 같은 간격으로 다시 받는다(만료가 너무 가까워지면 그만둔다)
 * - 성공(REAUTHENTICATED): 새 만료 60초 전으로 다시 잡는다. 만료가 늘지 않았으면 더 하지 않고 4401을 기다린다
 * - 실패 INVALID_TICKET(티켓 만료·이미 씀): 만료 전이면 새 티켓으로 한 번만 다시 시도한다
 * - 그 밖의 실패·모르는 값: 다시 시도하지 않는다. 연결은 기존 만료에 4401로 닫히고, 그때 새 티켓으로 다시 연결한다
 * 만료는 서버 시각이므로 서버 시계(serverNow)로 비교한다(기기 시계가 어긋나도 제때 재인증한다).
 * 연결마다 start로 시작하고, 연결이 끊기거나 정리되면 stop으로 멈춘다(늦게 끝난 티켓 요청도 보내지 않는다).
 */
export function createReauth({
  request = requestTicket,
  send,
  onSignedOut,
  now = serverNow,
  retryDelay = ticketRetryDelay,
}: {
  request?: (options: { minTokenMs: number }) => Promise<TicketResult>
  /** 열린 연결에 재인증 프레임을 보낸다. 연결이 없으면 false */
  send: (ticket: string) => boolean
  /** 재인증하려는데 토큰을 다시 받지 못했다(다시 로그인해야 함) */
  onSignedOut: () => void
  /** 서버 시계로 본 지금 */
  now?: () => number
  /** 티켓을 받지 못한 횟수에 따른 다시 받기 대기 */
  retryDelay?: (failures: number) => number
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let expiresAt: number | null = null
  /** 이번 만료에서 INVALID_TICKET으로 다시 시도했는지 */
  let retried = false
  /** start·stop마다 오른다. 끝난 연결의 티켓 요청 결과를 버린다 */
  let epoch = 0

  const clear = () => {
    clearTimeout(timer)
    timer = undefined
  }

  const tooLate = () =>
    expiresAt === null || expiresAt - now() < REAUTH_MIN_LEAD_MS

  const run = async (failures = 0) => {
    const started = epoch
    if (tooLate()) return
    const result = await request({
      // 새 연결 만료가 지금 만료보다 늦도록, 지금 만료 뒤로도 60초 넘게 남는 토큰을 쓴다.
      minTokenMs: Math.max(
        TOKEN_MIN_REMAINING_MS,
        expiresAt! - now() + REAUTH_BEFORE_MS,
      ),
    })
    if (started !== epoch || tooLate()) return
    if (result.ok) {
      send(result.ticket.ticket)
      return
    }
    if (result.reason === 'signedOut') return onSignedOut()
    if (result.reason === 'retry') {
      clear()
      timer = setTimeout(() => void run(failures + 1), retryDelay(failures))
    }
  }

  /** 이 만료에 맞춰 재인증을 잡는다. 모르면(null) 잡지 않는다 */
  const schedule = (connectionExpiresAt: string | null) => {
    clear()
    retried = false
    const at = connectionExpiresAt ? Date.parse(connectionExpiresAt) : NaN
    expiresAt = Number.isNaN(at) ? null : at
    if (expiresAt === null) return
    timer = setTimeout(
      () => void run(),
      Math.max(0, expiresAt - REAUTH_BEFORE_MS - now()),
    )
  }

  return {
    /** 연결됐다. 이 연결의 만료(연결에 쓴 티켓의 connectionExpiresAt)로 재인증을 잡는다 */
    start(connectionExpiresAt: string | null) {
      epoch++
      schedule(connectionExpiresAt)
    },
    /** 재인증 결과 */
    handle(frame: ChatReauthFrame) {
      if (frame.type === 'REAUTHENTICATED') {
        const next = frame.connectionExpiresAt
          ? Date.parse(frame.connectionExpiresAt)
          : NaN
        // 만료가 늘지 않았으면 곧바로 다시 재인증하게 되므로 더 하지 않는다(그 만료에 4401로 닫히면 다시 연결한다).
        if (expiresAt !== null && !(next > expiresAt)) {
          clear()
          return
        }
        schedule(frame.connectionExpiresAt)
        return
      }
      if (
        frame.type === 'REAUTH_FAILED' &&
        frame.code === 'INVALID_TICKET' &&
        !retried
      ) {
        retried = true
        void run()
      }
    },
    /** 연결이 끊겼거나 정리됐다 */
    stop() {
      epoch++
      clear()
      expiresAt = null
    },
  }
}
