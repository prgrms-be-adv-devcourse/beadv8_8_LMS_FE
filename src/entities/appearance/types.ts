/**
 * 출연 요청서 상태 (목록·상세에 보이는 것만)
 * - REQUESTED: 응답 대기. HP 보류가 끝나 게스트의 수락·거절을 기다린다
 * - ACCEPTED: 수락. 출연이 성립했다
 * - REJECTED: 거절. 보류 HP를 호스트에게 반환한다
 * - EXPIRED: 만료. 수락 기한까지 응답이 없어 보류 HP를 반환한다
 * - CANCELED: 취소. 게스트 응답 전에 호스트가 취소해 보류 HP를 반환한다
 * 보내기 직후 HP 보류가 끝나기 전(HOLD_PENDING)·실패(HOLD_FAILED)한 요청서는 목록에 나오지 않는다.
 */
export type AppearanceRequestStatus =
  | 'HOLD_PENDING'
  | 'HOLD_FAILED'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELED'

/** 보류 HP 반환 진행 상태 (거절·취소·만료된 경우) */
export type HpReleaseStatus = 'PENDING' | 'DONE' | 'DEAD'

/** GET /appearances/requests/sent·received 한 줄 */
export type AppearanceRequestSummary = {
  id: number
  hostId: number
  guestId: number
  title: string
  /** 방송 예정 일시 (KST) */
  scheduledAt: string
  fee: number
  /** 수락 기한 (KST) */
  acceptDeadline: string
  status: AppearanceRequestStatus
  createdAt: string
}

/** GET /appearances/requests/{requestId} */
export type AppearanceRequest = AppearanceRequestSummary & {
  hostChannelUrl: string
  /** 예상 출연 시간(분) */
  expectedMinutes: number
  content: string
  /** 수락할 때 그대로 보낸다. 그사이 호스트가 수정했으면 수락이 막힌다 */
  version: number
  rejectReason: string | null
  respondedAt: string | null
  canceledAt: string | null
  /** 성립한 출연 ID (수락된 경우) */
  appearanceId: number | null
  hpReleaseStatus: HpReleaseStatus | null
  updatedAt: string
}

/** POST /appearances/requests */
export type AppearanceRequestInput = {
  guestId: number
  title: string
  hostChannelUrl: string
  scheduledAt: string
  expectedMinutes: number
  content: string
  fee: number
  acceptDeadline: string
}

/** PATCH /appearances/requests/{requestId}. 보낸 값만 바뀐다 */
export type AppearanceRequestEdit = Partial<
  Pick<AppearanceRequestInput, 'title' | 'content' | 'hostChannelUrl'>
>

export type RequestSide = 'host' | 'guest'
