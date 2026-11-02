/**
 * 강의 HP 작업: 강의 주문 항목의 보류·반환·지급을 지갑에 보내는 요청 한 건 (BE LectureHpTask).
 * 실패하면 BE 재시도 배치가 같은 요청 ID로 다시 보내고, 자동 처리가 멈추면(DEAD) 관리자가 재시도한다.
 */

/**
 * - PENDING: 다음 시도 시각을 기다린다
 * - PROCESSING: 지갑에 요청 중이다
 * - COMPLETED: 끝났다. 결과는 outcome에 있다
 * - DEAD: 자동 처리가 멈췄다. 관리자가 원인을 확인하고 재시도한다
 */
export type HpTaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'DEAD'

/** 끝난 작업의 결과: 지갑이 처리함, 보류 확정 거절(잔액 부족), 실행 전에 필요 없어진 보류 */
export type HpTaskOutcome = 'SUCCEEDED' | 'REJECTED' | 'SKIPPED'

/** 지갑에 보내는 요청 종류: 구매자 HP 보류, 보류 HP 반환(구매자에게), 보류 HP 지급(판매자에게) */
export type HpTaskType = 'HOLD' | 'RELEASE' | 'PAYOUT'

/** 작업을 만든 업무. 유형은 목적에서 정해진다(ORDER_HOLD는 보류, PAYOUT은 지급, 나머지는 반환) */
export type HpTaskPurpose =
  'ORDER_HOLD' | 'HOLD_COMPENSATION' | 'CANCEL' | 'RETURN' | 'PAYOUT'

/** 시도 한 번의 결과 (BE LectureHpAttemptResult) */
export type HpAttemptResult =
  | 'SUCCEEDED'
  | 'TERMINAL_REJECTION'
  | 'RETRYABLE'
  | 'UNKNOWN_RESULT'
  | 'INVARIANT_VIOLATION'
  | 'LEASE_EXPIRED'

/** GET /lectures/admin/hp-tasks 한 줄 (BE LectureHpTaskResponse). 시각은 시간대 없는 KST다 */
export type LectureHpTask = {
  id: number
  status: HpTaskStatus
  /** COMPLETED일 때만 있다 */
  outcome: HpTaskOutcome | null
  taskType: HpTaskType
  purpose: HpTaskPurpose
  /** 지갑 요청 ID(멱등 키). 관리자 재시도도 같은 값으로 보내 HP가 두 번 움직이지 않는다 */
  requestId: string
  orderId: number
  orderItemId: number
  /** 구매자 */
  payerUserId: number
  /** 지급받는 판매자. 지급 작업에만 있다 */
  receiverUserId: number | null
  /** 항목 가격 */
  amountHp: number
  /** 현재 자동 재시도 주기의 시도 횟수. 관리자 재시도 때 0이 된다 */
  attemptCount: number
  /** 관리자 재시도를 포함한 누적 시도 횟수 */
  totalAttemptCount: number
  manualRetryCount: number
  /** 다음 시도 시각. 대기(PENDING)일 때만 뜻이 있다 */
  nextAttemptAt: string
  /** 마지막 실패 코드: 지갑 실패 코드 또는 실행기 결과(errorCode.ts) */
  lastErrorCode: string | null
  lastFailedAt: string | null
  lastRetriedByUserId: number | null
  lastRetriedAt: string | null
  completedAt: string | null
  createdAt: string
}

/** 시도 한 번 (BE LectureHpTaskDetailResponse.Attempt). 원래 오류 코드·진단 정보는 관리자만 본다 */
export type LectureHpTaskAttempt = {
  attemptNo: number
  /** 실행 중이면 null */
  result: HpAttemptResult | null
  errorCode: string | null
  /** 변환 전 지갑 오류 코드 */
  rawErrorCode: string | null
  /** 예외 종류·메시지 등 진단 정보 */
  errorDetail: string | null
  startedAt: string
  completedAt: string | null
}

/** GET /lectures/admin/hp-tasks/{taskId}: 작업과 시도 이력(시도 순) */
export type LectureHpTaskDetail = {
  task: LectureHpTask
  attempts: LectureHpTaskAttempt[]
}
