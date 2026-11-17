import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type {
  NotificationConnectionTicket,
  NotificationItem,
  ReadAllResult,
  UnreadCount,
} from './types'

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
}

/** 목록에 두는 알림 수. 서버도 최신 20개만 보여 준다 */
export const NOTIFICATION_LIST_SIZE = 20

/**
 * 내 알림 최신 20개(발생 시각 내림차순, 페이지 없음). 목록을 연 것만으로는 읽음이 되지 않는다.
 * 새 알림은 실시간 연결(features/notification/NotificationConnection)이 맨 앞에 넣는다. 실시간 전달은 유실될 수
 * 있어 창에 포커스가 돌아와도 다시 읽는다.
 */
export const notificationsQuery = queryOptions({
  queryKey: notificationKeys.list(),
  queryFn: () => api<NotificationItem[]>('/notifications'),
  refetchOnWindowFocus: true,
})

/** 안 읽은 알림 수(상단 헤더 알림 배지). 실시간 연결이 프레임의 값으로 바꾸고, 창에 포커스가 돌아와도 다시 읽는다 */
export const unreadCountQuery = queryOptions({
  queryKey: notificationKeys.unreadCount(),
  queryFn: () => api<UnreadCount>('/notifications/unread-count'),
  refetchOnWindowFocus: true,
})

/** 알림 하나를 읽음으로. 이미 읽었으면 처음 읽은 시각 그대로 200, 남의·없는·밀려난 알림은 404 NOTIFICATION_NOT_FOUND */
export function markNotificationRead(notificationId: number) {
  return api<NotificationItem>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
  })
}

/** 보이는 알림 중 안 읽은 것을 모두 읽음으로 */
export function markAllNotificationsRead() {
  return api<ReadAllResult>('/notifications/read-all', { method: 'PATCH' })
}

/**
 * 실시간 연결 티켓(일회용, 30초 안에 연결). 회원마다 60초에 10번까지다(넘으면 429 TOO_MANY_REQUESTS).
 * 티켓 저장소를 쓸 수 없으면 503 CONNECTION_TICKET_UNAVAILABLE, 관리자는 403이다.
 */
export function issueNotificationTicket() {
  return api<NotificationConnectionTicket>('/notifications/ws-tickets', {
    method: 'POST',
  })
}
