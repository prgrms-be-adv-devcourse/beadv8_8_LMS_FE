import type { QueryClient } from '@tanstack/react-query'
import {
  NOTIFICATION_LIST_SIZE,
  notificationKeys,
} from '@/entities/notification/api'
import type {
  NotificationFrame,
  NotificationItem,
  UnreadCount,
} from '@/entities/notification/types'

/** 프레임 본문이 계약 모양인지(알림 ID·문구와 안 읽은 수가 있다). 아니면 버린다(목록은 다시 읽을 때 맞춰진다) */
export function isNotificationFrame(body: unknown): body is NotificationFrame {
  if (typeof body !== 'object' || body === null) return false
  const { notification, unreadCount } = body as Record<string, unknown>
  if (typeof notification !== 'object' || notification === null) return false
  const { id, message } = notification as Record<string, unknown>
  return (
    typeof id === 'number' &&
    typeof message === 'string' &&
    typeof unreadCount === 'number'
  )
}

/**
 * 실시간 알림 프레임을 목록·안 읽은 수 캐시에 넣는다.
 * - 목록: 맨 앞에 넣는다. 같은 ID가 있으면 빼고 새 값으로 맨 앞에 둔다(강의 지급 하루 묶음처럼 갱신된 같은 알림이
 *   다시 온다). 최신 20개만 남긴다. 아직 불러오지 않았으면 그대로 둔다(열 때 서버에서 읽는다)
 * - 안 읽은 수: 프레임의 값으로 바꾼다(서버가 보낼 때 센 값)
 */
export function applyNotificationFrame(
  queryClient: QueryClient,
  { notification, unreadCount }: NotificationFrame,
) {
  queryClient.setQueryData<NotificationItem[]>(
    notificationKeys.list(),
    (list) =>
      list && [
        notification,
        ...list
          .filter((n) => n.id !== notification.id)
          .slice(0, NOTIFICATION_LIST_SIZE - 1),
      ],
  )
  queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount(), {
    count: unreadCount,
  })
}
