/**
 * 알림센터 목록 항목 (BE auxiliary-app notification `NotificationItem`).
 * 문구는 서버가 만든 완성 문장이라 그대로 보인다. FE는 kind로 문구를 만들지 않는다.
 */
export type NotificationItem = {
  id: number
  /** 종류 코드. BE가 새 종류를 더할 수 있어 string으로 둔다 */
  kind: string
  message: string
  /** 눌렀을 때 갈 업무 자원의 종류. 갈 곳이 없으면 null */
  targetType: string | null
  /** 이동할 자원의 ID(문자열). targetType이 null이면 null */
  targetId: string | null
  /** 발생 시각(UTC, `Z`). 목록은 이 값의 내림차순이다 */
  occurredAt: string
  /** 처음 읽은 시각(UTC). 안 읽었으면 null */
  readAt: string | null
}

/** GET /notifications/unread-count. 보이는 최신 20개 안에서 센다(최대 20) */
export type UnreadCount = { count: number }

/** PATCH /notifications/read-all */
export type ReadAllResult = { updatedCount: number }

/** POST /notifications/ws-tickets. 실시간 연결에 쓰는 일회용 티켓 */
export type NotificationConnectionTicket = {
  /** 한 번만, 받자마자 쓴다(연결 주소의 ticket 쿼리) */
  ticket: string
  /** 티켓 유효 시간(초). 이 안에 연결해야 한다 */
  expiresInSeconds: number
  /** 이 티켓으로 연 연결을 서버가 닫는 시각(ISO-8601 UTC, 최대 발급 + 15분). 그때 종료 코드 4401로 닫는다 */
  connectionExpiresAt: string
}

/**
 * 실시간 알림 프레임(`/user/queue/notifications`의 MESSAGE 본문, RsData가 아니다).
 * 저장된 알림 한 건과 그때의 안 읽은 수다. 읽음·전체 읽음 때는 오지 않는다.
 */
export type NotificationFrame = {
  /** 목록 항목과 같은 모양 */
  notification: NotificationItem
  /** 보이는 최신 20개 안의 안 읽은 수 */
  unreadCount: number
}
