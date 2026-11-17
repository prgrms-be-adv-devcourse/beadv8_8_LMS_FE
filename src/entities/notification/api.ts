import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { NotificationItem, ReadAllResult, UnreadCount } from './types'

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
}

/**
 * 내 알림 최신 20개(발생 시각 내림차순, 페이지 없음). 목록을 연 것만으로는 읽음이 되지 않는다.
 * 실시간 연결이 없어 창에 포커스가 돌아오면 다시 읽는다.
 */
export const notificationsQuery = queryOptions({
  queryKey: notificationKeys.list(),
  queryFn: () => api<NotificationItem[]>('/notifications'),
  refetchOnWindowFocus: true,
})

/** 안 읽은 알림 수(상단 헤더 알림 배지). 창에 포커스가 돌아오면 다시 읽는다 */
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
