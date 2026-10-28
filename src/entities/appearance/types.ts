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
 * - CLOSED: 마감. 조기 마감(EARLY)이나 마감 일시 배치(DEADLINE)로 닫히고, 채우지 못한 자리의 출연료를 돌려준다
 * - CANCELED: 모집 전체 취소. 성립한 출연은 출연마다 호스트 일방 취소(위약금)로, 대기 지원은 미선정으로 끝난다
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
  /** 조회한 회원의 이 모집글 지원 (상태 그대로). 지원한 적이 없거나 호스트 본인이면 null */
  myApplication: Application | null
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
  /** 모집글 제목 (현재 값, 모집글을 고치면 따라 바뀐다) */
  recruitTitle: string
  /** 모집글 방송 예정 일시 (KST) */
  recruitScheduledAt: string
  recruitStatus: RecruitStatus
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

/**
 * 출연(성립 건) 상태
 * - ESTABLISHED: 성립. HP는 보류된 상태
 * - CANCEL_REQUESTED: 게스트의 출연 취소 요청을 호스트가 처리 중
 * - CONFIRMED: 출연 확인(호스트 확인 또는 방송 예정 일시 + 7일 자동 확인). 게스트에게 지급
 * - ABSENT: 불참. 보류 HP를 호스트에게 반환
 * - CANCELED_BY_HOST: 호스트 일방 취소. 위약금을 게스트에게 지급하고 나머지는 호스트에게 반환
 * - CANCELED_BY_AGREEMENT: 합의 취소(호스트가 취소 요청 수락). 위약금 없음
 */
export type AppearanceStatus =
  | 'ESTABLISHED'
  | 'CANCEL_REQUESTED'
  | 'CONFIRMED'
  | 'ABSENT'
  | 'CANCELED_BY_HOST'
  | 'CANCELED_BY_AGREEMENT'

/** 출연 출처: 출연 요청 / 출연 모집 */
export type AppearanceSourceType = 'REQUEST' | 'RECRUIT'

/** GET /appearances 역할 필터 */
export type AppearanceRole = 'HOST' | 'GUEST'

/**
 * 출연 취소 요청 상태
 * - REQUESTED: 호스트 응답 대기
 * - ACCEPTED: 수락(합의 취소)
 * - REJECTED: 거절(출연 유지, 1번 더 요청 가능)
 * - AUTO_REJECTED: 방송 예정 일시까지 응답이 없어 자동 거절
 * - CLOSED_BY_HOST_CANCEL: 호스트가 요청을 확인하고 일방 취소(게스트에게 위약금 지급)
 */
export type AppearanceCancelRequestStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'AUTO_REJECTED'
  | 'CLOSED_BY_HOST_CANCEL'

/** 출연 취소 요청 1건 (상세의 이력, 순번 순 최대 2건) */
export type AppearanceCancelRequest = {
  id: number
  /** 몇 번째 요청인지 (1 또는 2) */
  sequence: number
  reason: string
  status: AppearanceCancelRequestStatus
  /** 거절 사유 (호스트, 선택) */
  rejectReason: string | null
  requestedAt: string
  respondedAt: string | null
}

/** GET /appearances 한 줄 */
export type AppearanceSummary = {
  id: number
  sourceType: AppearanceSourceType
  requestId: number | null
  recruitId: number | null
  /** 출처 요청서·모집글 제목 */
  title: string
  hostId: number
  guestId: number
  /** 출연료 (HP, 성립 시점 값) */
  fee: number
  /** 방송 예정 일시 (KST). 취소 요청·응답·일방 취소는 이 시각 전까지 */
  scheduledAt: string
  status: AppearanceStatus
  establishedAt: string
}

/** GET /appearances/{appearanceId} (호스트·게스트만). 취소 요청·응답 결과도 이 형식 */
export type Appearance = AppearanceSummary & {
  applicationId: number | null
  canceledAt: string | null
  cancelRequests: AppearanceCancelRequest[]
  /** 반환(합의 취소·불참) 진행 상태. 반환할 일이 없으면 null */
  hpReleaseStatus: HpReleaseStatus | null
  /** 호스트 일방 취소 위약금 (HP, 게스트에게 지급). 일방 취소된 경우만 */
  penaltyAmount: number | null
  /** 호스트 일방 취소 사유 (선택). 모집 전체 취소면 모집글 취소 사유 */
  hostCancelReason: string | null
  /** 위약금 정산 진행 상태. 일방 취소 전이면 null */
  hpPenaltyStatus: HpReleaseStatus | null
  /** 출연 확인 방식 (확인된 경우): 호스트 확인 / 자동 확인 */
  confirmType: 'HOST' | 'AUTO' | null
  confirmedAt: string | null
  absentAt: string | null
  absentReason: string | null
  /** 출연료 지급 진행 상태. 확인 전이면 null */
  hpPayoutStatus: HpReleaseStatus | null
  version: number
  createdAt: string
  updatedAt: string
}

/** 호스트 일방 취소·모집 전체 취소 요청 본문 */
export type HostCancelInput = {
  reason?: string
  /** 처리 중인 게스트 취소 요청이 있어도 취소한다는 확인 (409 CANCEL_REQUEST_CONFIRM_REQUIRED 뒤 true로 다시 보낸다) */
  confirmPendingCancelRequest?: boolean
}
