/**
 * 출연 HP 작업: 출연 요청서·모집글·출연의 보류 HP 반환·위약금 정산·지급을 지갑에 보내는 요청 한 건 (BE 출연 앱 HpTask).
 * 실패하면 간격을 늘려 가며 자동으로 다시 시도하고, 지갑이 거절하거나 재시도를 다 써도 실패하면 자동 처리가 멈춘다(DEAD).
 * 멈춰도 업무 상태(거절·확인·취소)는 되돌리지 않으므로 관리자가 원인을 고친 뒤 같은 작업을 다시 시도한다.
 * 강의 HP 작업(entities/hp-task)과 상태 값·API 모양이 달라 따로 둔다.
 */

/**
 * - PENDING: 대기 또는 자동 재시도 중
 * - DONE: 지갑이 처리했다
 * - DEAD: 자동 처리가 멈췄다. 관리자가 원인을 확인하고 다시 시도한다
 */
export type AppearanceHpTaskStatus = 'PENDING' | 'DONE' | 'DEAD'

/**
 * - RELEASE: 보류 HP를 호스트에게 돌려준다
 * - PENALTY: 보류에서 위약금은 게스트에게 지급하고 나머지는 호스트에게 돌려준다
 * - PAYOUT: 출연 확인으로 보류에서 출연료를 게스트에게 지급한다
 */
export type AppearanceHpTaskType = 'RELEASE' | 'PENALTY' | 'PAYOUT'

/** 작업 대상: 출연 요청서 / 출연 모집글 */
export type AppearanceHpTaskRefType =
  'APPEARANCE_REQUEST' | 'APPEARANCE_RECRUIT'

/** 작업을 만든 업무 (BE HpTaskReason) */
export type AppearanceHpTaskReason =
  | 'REQUEST_REJECTED'
  | 'REQUEST_CANCELED'
  | 'REQUEST_EXPIRED'
  | 'RECRUIT_CLOSED'
  | 'CANCEL_AGREED'
  | 'HOST_CANCELED'
  | 'RECRUIT_CANCELED'
  | 'APPEARANCE_CONFIRMED'
  | 'APPEARANCE_ABSENT'

/** GET /appearances/admin/hp-tasks 한 줄 (BE HpTaskAdminResDto). 상세 API는 없다. 시각은 시간대 없는 KST다 */
export type AppearanceHpTask = {
  id: number
  taskType: AppearanceHpTaskType
  refType: AppearanceHpTaskRefType
  /** 요청서 또는 모집글 ID */
  refId: number
  /** 관련 출연. 위약금 정산·지급, 출연 단위 반환에만 있다 */
  appearanceId: number | null
  /** 보류한 회원(호스트). 반환받는 회원이자 지급·위약금을 내는 회원 */
  memberId: number
  /** 받는 회원(게스트). 위약금 정산·지급에만 있다 */
  receiverId: number | null
  /** 옮기는 HP 전체. 위약금 정산이면 기준 출연료 */
  amount: number
  /** 받는 회원 몫. 위약금 정산이면 위약금, 지급이면 amount와 같다. 반환에는 없다 */
  payoutAmount: number | null
  reason: AppearanceHpTaskReason
  /** 지갑 요청 ID(멱등 키). 관리자가 다시 시도해도 같은 값으로 보내 HP가 두 번 움직이지 않는다 */
  idempotencyKey: string
  status: AppearanceHpTaskStatus
  /** 시도 횟수. 관리자가 다시 시도하면 0부터 다시 센다 */
  attemptCount: number
  /** 다음에 실행할 수 있는 시각. 대기(PENDING)일 때만 뜻이 있다 */
  nextAttemptAt: string | null
  /** 마지막 실패 내용. 지갑 거절이면 `{오류 코드}: {메시지}` */
  lastError: string | null
  /** 처리가 끝난 시각. 멈춤(DEAD)이면 멈춘 시각 */
  completedAt: string | null
  createdAt: string
  manualRetryCount: number
  /** 마지막으로 다시 시도한 관리자 회원 ID */
  lastManualRetryBy: number | null
  lastManualRetryAt: string | null
}
