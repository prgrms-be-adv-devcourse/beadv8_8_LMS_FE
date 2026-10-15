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

/**
 * 출연 모집글 상태 (목록·상세에 보이는 것만)
 * - RECRUITING: 모집 중. 1인 출연료 × 모집 인원만큼 HP가 보류돼 있다
 * - CLOSED: 마감. 조기 마감(EARLY)이나 마감 일시 배치(DEADLINE)로 닫히고, 성립하지 못한 자리분 HP를 돌려준다
 * - CANCELED: 모집 전체 취소 (BE 예정, 아직 API 없음)
 * 올리기 직후 HP 보류가 끝나기 전(HOLD_PENDING)·실패(HOLD_FAILED)한 글은 목록·상세에 나오지 않는다.
 */
export type RecruitStatus =
  'HOLD_PENDING' | 'HOLD_FAILED' | 'RECRUITING' | 'CLOSED' | 'CANCELED'

/** 마감 방식: EARLY 호스트 조기 마감 / DEADLINE 마감 일시 도래 */
export type RecruitCloseType = 'EARLY' | 'DEADLINE'

/** GET /appearances/recruits·recruits/mine 한 줄 */
export type RecruitSummary = {
  id: number
  hostId: number
  title: string
  /** 방송 예정 일시 (KST) */
  scheduledAt: string
  /** 1인당 출연료 (HP) */
  feePerPerson: number
  recruitCount: number
  /** 수락해 출연이 성립한 인원 */
  selectedCount: number
  /** 게스트가 취소한 지원만 뺀 지원 수 (대기·수락·미선정) */
  applicantCount: number
  /** 모집 마감 일시 (KST) */
  recruitDeadline: string
  status: RecruitStatus
  createdAt: string
}

/** GET /appearances/recruits/{recruitId} */
export type Recruit = RecruitSummary & {
  hostChannelUrl: string
  /** 예상 출연 시간(분) */
  expectedMinutes: number
  content: string
  closeType: RecruitCloseType | null
  closedAt: string | null
  canceledAt: string | null
  /** 마감 반환 진행 상태. 호스트에게만 있고, 반환할 금액이 없거나 마감 전이면 null */
  hpReleaseStatus: HpReleaseStatus | null
  version: number
  updatedAt: string
}

/** POST /appearances/recruits */
export type RecruitInput = {
  title: string
  hostChannelUrl: string
  scheduledAt: string
  expectedMinutes: number
  content: string
  feePerPerson: number
  recruitCount: number
  recruitDeadline: string
}

/** PATCH /appearances/recruits/{recruitId}. 보낸 값만 바뀐다 */
export type RecruitEdit = Partial<
  Pick<RecruitInput, 'title' | 'content' | 'hostChannelUrl'>
>

/**
 * 모집 지원 상태
 * - APPLIED: 호스트 응답 대기. 게스트가 취소할 수 있다
 * - SELECTED: 호스트가 수락해 출연이 성립했다
 * - NOT_SELECTED: 거절됐거나 응답 전에 모집이 마감됐다
 * - WITHDRAWN: 게스트가 취소했다
 * 한 모집글에 한 번만 지원할 수 있어 끝난 지원은 다시 지원할 수 없다.
 */
export type ApplicationStatus =
  'APPLIED' | 'SELECTED' | 'NOT_SELECTED' | 'WITHDRAWN'

/** 모집 지원 (지원자 목록·내 지원 목록 한 줄) */
export type Application = {
  id: number
  recruitId: number
  guestId: number
  message: string | null
  status: ApplicationStatus
  respondedAt: string | null
  withdrawnAt: string | null
  /** 성립한 출연 ID (수락된 경우) */
  appearanceId: number | null
  createdAt: string
}

/** 모집 목록 탭: 모집 중 / 내 모집글 */
export type RecruitListTab = 'open' | 'mine'
