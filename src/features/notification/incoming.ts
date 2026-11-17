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

/**
 * 프레임을 받아 캐시에 넣는다. 목록·안 읽은 수를 읽는 중이면(연결 직후 다시 읽기, 창 포커스 등) 그 응답은 이 알림 전의
 * 값일 수 있어, 늦게 도착해 프레임을 덮어쓰지 않게 그 조회를 취소하고 프레임을 넣은 뒤 다시 읽는다. 서버는 저장을
 * commit한 뒤 프레임을 보내므로 새 조회에는 이 알림이 들어 있다.
 * active가 false가 되면(취소를 기다리는 사이 연결을 정리함) 넣지 않는다.
 */
export async function receiveNotificationFrame(
  queryClient: QueryClient,
  frame: NotificationFrame,
  active: () => boolean,
) {
  const queryKey = notificationKeys.all
  const fetching = queryClient.isFetching({ queryKey }) > 0
  // 취소한 조회는 시작 전 값으로 돌아간다. 돌아간 뒤에 넣어야 하므로 기다린다.
  if (fetching) await queryClient.cancelQueries({ queryKey })
  if (!active()) return
  applyNotificationFrame(queryClient, frame)
  if (fetching) void queryClient.invalidateQueries({ queryKey })
}
