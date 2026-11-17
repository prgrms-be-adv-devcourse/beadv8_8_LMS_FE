import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type {
  NotificationConnectionTicket,
  NotificationItem,
} from '@/entities/notification/types'
import type { RsData } from '@/shared/api/types'
import { server } from './server'

/**
 * 테스트 전용: BE 알림센터(auxiliary-app notification, `docs/api/notification.md`)를 흉내 내는 MSW 핸들러.
 * 목록·안 읽은 수·읽음·전체 읽음이 같은 메모리 목록을 본다. 목록은 최신 20개, 안 읽은 수도 그 20개 안에서 센다.
 * 이미 읽은 알림을 다시 읽으면 처음 읽은 시각 그대로 200이고, 목록에 없는 알림은 404 NOTIFICATION_NOT_FOUND다.
 */

const READ_AT = '2026-11-17T01:00:00Z'

/** 알림 한 건. 기본은 안 읽은 충전 완료 알림이다 */
export const notification = (
  id: number,
  over: Partial<NotificationItem> = {},
): NotificationItem => ({
  id,
  kind: 'CHARGE_COMPLETED',
  message: `알림 ${id}`,
  targetType: 'CHARGE',
  targetId: String(1000 + id),
  occurredAt: '2026-11-16T03:00:00Z',
  readAt: null,
  ...over,
})

const ok = <T>(data: T) =>
  HttpResponse.json<RsData<T>>({ statusCode: 200, message: 'mock', data })

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

type MockOptions = {
  /** 읽음 요청에 이 응답을 준다(실패 확인용). 없으면 BE처럼 처리한다 */
  readResponse?: () => Response
  /**
   * 목록·안 읽은 수 조회의 응답을 이 Promise가 끝날 때까지 늦춘다(없으면 바로). 응답 값은 요청을 받은 때의 값이다
   * (응답이 늦게 도착하는 사이 새 알림이 저장되는 경우 확인용)
   */
  hold?: () => Promise<void> | undefined
}

/**
 * 알림 목록을 items로 두고 BE 알림 API를 켠다. 읽음·전체 읽음은 이후 조회에 반영한다.
 * 보낸 읽음 요청의 알림 ID는 reads, 전체 읽음 요청 수는 readAllCount(), 목록·안 읽은 수 조회 수는
 * listCount()·unreadCountCount()로 본다. save(item)은 BE가 새 알림을 저장한 것처럼 목록 맨 앞에 넣는다(같은 ID는 바꾼다).
 */
export function mockNotifications(
  items: NotificationItem[],
  { readResponse, hold }: MockOptions = {},
) {
  let list = items.slice(0, 20)
  const reads: number[] = []
  let readAll = 0
  let listed = 0
  let counted = 0
  server.use(
    http.get('*/api/v1/notifications', async () => {
      listed++
      const data = list
      await hold?.()
      return ok(data)
    }),
    http.get('*/api/v1/notifications/unread-count', async () => {
      counted++
      const count = list.filter((n) => n.readAt == null).length
      await hold?.()
      return ok({ count })
    }),
    http.patch('*/api/v1/notifications/read-all', () => {
      readAll++
      const updatedCount = list.filter((n) => n.readAt == null).length
      list = list.map((n) => ({ ...n, readAt: n.readAt ?? READ_AT }))
      return ok({ updatedCount })
    }),
    http.patch('*/api/v1/notifications/:notificationId/read', ({ params }) => {
      const id = Number(params.notificationId)
      reads.push(id)
      if (readResponse) return readResponse()
      const found = list.find((n) => n.id === id)
      if (!found)
        return problem(
          404,
          'NOTIFICATION_NOT_FOUND',
          '알림을 찾을 수 없습니다.',
        )
      const read = { ...found, readAt: found.readAt ?? READ_AT }
      list = list.map((n) => (n.id === id ? read : n))
      return ok(read)
    }),
  )
  return {
    reads,
    readAllCount: () => readAll,
    listCount: () => listed,
    unreadCountCount: () => counted,
    save: (item: NotificationItem) => {
      list = [item, ...list.filter((n) => n.id !== item.id)].slice(0, 20)
    },
  }
}

/** 읽음 요청이 404 NOTIFICATION_NOT_FOUND로 실패한다(밀려난 알림 등) */
export const notificationNotFound = () =>
  problem(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.')

/** 상단 헤더의 알림 아이콘. 배지는 읽지 않으므로 안 읽은 수는 링크 이름(`알림, 안 읽은 알림 n개`)으로 본다. */
export const headerAlertsLink = () =>
  within(screen.getByRole('banner')).getByRole('link', { name: /^알림/ })

/**
 * 실시간 연결 티켓 응답. 티켓은 `n-<부른 횟수>`이고 연결 만료는 15분 뒤다. 받은 Authorization과 횟수를 남긴다.
 * respond가 부른 횟수마다 다른 응답을 정한다.
 * - 상태 코드: 그 오류(401은 빈 본문, 429 TOO_MANY_REQUESTS + Retry-After, 503 CONNECTION_TICKET_UNAVAILABLE, 403)
 * - 'network': 응답 없음
 * - { connectionExpiresAt }: 그 연결 만료로 발급한다(이미 지난 만료 확인용)
 * Promise를 돌려주면 그 값이 나올 때까지 응답을 늦춘다.
 */
type TicketAnswer = number | 'network' | { connectionExpiresAt: string } | null

export function mockNotificationTickets(
  respond: (call: number) => TicketAnswer | Promise<TicketAnswer> = () => null,
) {
  const state = { calls: 0, authorizations: [] as (string | null)[] }
  server.use(
    http.post('*/api/v1/notifications/ws-tickets', async ({ request }) => {
      state.calls++
      state.authorizations.push(request.headers.get('Authorization'))
      const call = state.calls
      const answer = await respond(call)
      if (answer === 'network') return HttpResponse.error()
      if (answer === 401) return new HttpResponse(null, { status: 401 })
      if (typeof answer === 'number') {
        if (answer === 429)
          return HttpResponse.json(
            { status: 429, code: 'TOO_MANY_REQUESTS' },
            { status: 429, headers: { 'Retry-After': '60' } },
          )
        return problem(
          answer,
          answer === 503 ? 'CONNECTION_TICKET_UNAVAILABLE' : 'FORBIDDEN',
          'mock',
        )
      }
      return ok<NotificationConnectionTicket>({
        ticket: `n-${call}`,
        expiresInSeconds: 30,
        connectionExpiresAt:
          answer?.connectionExpiresAt ??
          new Date(Date.now() + 15 * 60_000).toISOString(),
      })
    }),
  )
  return state
}
