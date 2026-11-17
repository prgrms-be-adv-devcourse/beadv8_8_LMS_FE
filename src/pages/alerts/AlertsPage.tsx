import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { notificationsQuery } from '@/entities/notification/api'
import { notificationPath } from '@/entities/notification/target'
import type { NotificationItem } from '@/entities/notification/types'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/entities/notification/useMarkRead'
import { INFLUENCER, type Viewer } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { formatDateTime } from '@/shared/lib/date'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AlertsPage.module.css'

/** 빈 알림 안내. 역할에 맞는 알림 종류를 알려 준다 */
function emptyText(viewer: Viewer) {
  return INFLUENCER.includes(viewer)
    ? '출연 요청, 출연 확인, 지급·송금 소식이 생기면 여기에 모아 둘게요.'
    : '충전, 구매 확정, 문의 답변 소식이 생기면 여기에 모아 둘게요.'
}

/**
 * 알림센터 (docs/mockup-ui.html AlertsScreen). 서버가 만든 문구를 최신 20개까지 보인다.
 * 누르면 안 읽은 알림은 읽음으로 바꾸고, 결과를 기다리지 않고 그 화면으로 간다. 갈 곳이 없으면 읽음만 하고 머문다.
 */
export function AlertsPage() {
  const viewer = useViewer() ?? 'GUEST'
  const { data, error, isPending, refetch } = useQuery(notificationsQuery)
  const markAll = useMarkAllNotificationsRead()
  const hasUnread = !!data?.some((n) => n.readAt == null)

  return (
    <div className="page">
      <PageHead
        title="알림"
        lede="출연 요청, 지급, 구매 확정처럼 HP가 움직이는 일을 알려 드려요."
        actions={
          hasUnread && (
            <button
              type="button"
              className="btn"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              모두 읽음
            </button>
          )
        }
      />
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="새 알림이 없어요">{emptyText(viewer)}</EmptyState>
      ) : (
        <>
          <section className={`panel ${styles.list}`} aria-label="알림 목록">
            {data.map((n) => (
              <AlertItem key={n.id} notification={n} viewer={viewer} />
            ))}
          </section>
          <p className="fine">최근 알림 20개까지 보여요.</p>
        </>
      )}
    </div>
  )
}

function AlertItem({
  notification,
  viewer,
}: {
  notification: NotificationItem
  viewer: Viewer
}) {
  const navigate = useNavigate()
  const markRead = useMarkNotificationRead()
  const unread = notification.readAt == null
  const path = notificationPath(notification, viewer)

  const body = (
    <>
      <span
        className={unread ? `${styles.dot} ${styles.on}` : styles.dot}
        aria-hidden="true"
      />
      <span className={styles.main}>
        {unread && <span className="sr-only">안 읽음,</span>}
        {unread ? (
          <b>{notification.message}</b>
        ) : (
          <span>{notification.message}</span>
        )}
        <time className="fine" dateTime={notification.occurredAt}>
          {formatDateTime(notification.occurredAt)}
        </time>
      </span>
      {path && (
        <span className="muted" aria-hidden="true">
          ›
        </span>
      )}
    </>
  )

  // 읽었고 갈 곳도 없으면 누를 일이 없다. 읽음이 반영돼도 포커스가 그 자리에 남게 버튼은 그대로 두고 비활성으로 표시한다.
  const idle = !unread && !path
  const open = () => {
    // 읽음은 기다리지 않는다. 실패(404 포함)해도 이동한다.
    if (unread) markRead.mutate(notification.id)
    if (path) navigate(path)
  }
  return (
    <button
      type="button"
      className={styles.item}
      aria-disabled={idle || undefined}
      onClick={idle ? undefined : open}
    >
      {body}
    </button>
  )
}
