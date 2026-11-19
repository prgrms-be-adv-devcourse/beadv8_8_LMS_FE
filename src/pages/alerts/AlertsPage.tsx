import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
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
import { AlertKindIcon } from './AlertKindIcon'
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
  // 다 읽으면 버튼을 숨기지 않고 막는다. 누른 버튼이 사라지거나 disabled가 되면 포커스를 잃는다.
  const markAllBlocked = !hasUnread || markAll.isPending

  return (
    <div className="page">
      <PageHead
        title="알림"
        lede="출연 요청, 지급, 구매 확정처럼 HP가 움직이는 일을 알려 드려요."
        actions={
          !!data?.length && (
            <button
              type="button"
              className="btn"
              aria-disabled={markAllBlocked || undefined}
              onClick={() => {
                if (!markAllBlocked) markAll.mutate()
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12.5l4.5 4.5L15 8.5M10 16l1 1 10-10" />
              </svg>
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
        <div className={styles.empty}>
          <EmptyBell />
          <EmptyState title="새 알림이 없어요">{emptyText(viewer)}</EmptyState>
        </div>
      ) : (
        <>
          <AlertList notifications={data} viewer={viewer} />
          <p className="fine">최근 알림 20개까지 보여요.</p>
        </>
      )}
    </div>
  )
}

/**
 * 화면을 연 뒤에 들어온 알림(실시간 프레임·다시 읽기)만 한 번 번쩍여 새로 왔음을 알린다.
 * 처음 그린 목록의 id를 기억해 두고, 그 밖의 id만 강조한다. 같은 id의 항목은 다시 그려지지 않아 한 번만 움직인다.
 */
function AlertList({
  notifications,
  viewer,
}: {
  notifications: readonly NotificationItem[]
  viewer: Viewer
}) {
  const [initialIds] = useState(() => new Set(notifications.map((n) => n.id)))
  return (
    <section className={`panel ${styles.list}`} aria-label="알림 목록">
      {notifications.map((n) => (
        <AlertItem
          key={n.id}
          notification={n}
          viewer={viewer}
          fresh={!initialIds.has(n.id)}
        />
      ))}
    </section>
  )
}

/** 빈 알림 그림(장식): 조용한 종과 꺼진 램프 */
function EmptyBell() {
  return (
    <svg
      className={styles.emptyArt}
      width="88"
      height="88"
      viewBox="0 0 88 88"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="44" cy="44" r="40" className={styles.artBg} />
      <path
        d="M30 52c3-3 4-7 4-15a10 10 0 0 1 20 0c0 8 1 12 4 15z"
        className={styles.artLine}
      />
      <path d="M40 57a4 4 0 0 0 8 0" className={styles.artLine} />
      <circle cx="60" cy="27" r="5" className={styles.artLamp} />
    </svg>
  )
}

function AlertItem({
  notification,
  viewer,
  fresh,
}: {
  notification: NotificationItem
  viewer: Viewer
  fresh: boolean
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
      <span className={styles.icon}>
        <AlertKindIcon kind={notification.kind} />
      </span>
      <span className={styles.main}>
        {unread && <span className="sr-only">안 읽음,</span>}
        {unread ? (
          <b>{notification.message}</b>
        ) : (
          <span>{notification.message}</span>
        )}
        <time className={styles.time} dateTime={notification.occurredAt}>
          {formatDateTime(notification.occurredAt)}
        </time>
      </span>
      {path && (
        <span className={styles.go} aria-hidden="true">
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
      className={[
        styles.item,
        unread && styles.unread,
        path && styles.navigable,
        fresh && styles.fresh,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-disabled={idle || undefined}
      onClick={idle ? undefined : open}
    >
      {body}
    </button>
  )
}
