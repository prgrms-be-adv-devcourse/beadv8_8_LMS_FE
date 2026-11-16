import type { OrderItemStatus } from '@/entities/order/types'

/**
 * 서비스 간 HP 대사: 강의·출연 앱이 자기 상태와 지갑의 보류·지급 기록을 비교한다(매일 배치, 관리자가 지금 실행).
 * 어긋난 건은 고치지 않고 남기기만 한다. BE가 마지막 실행 한 번만 준다.
 */

/** 대사를 돌리는 앱. 화면의 탭이고 URL ?app= 값이다 */
export type ReconciliationApp = 'lecture' | 'appearance'

/**
 * - RUNNING: 실행 중. 어긋난 건은 비어 있다
 * - COMPLETED: 끝까지 비교했다
 * - INCOMPLETE: 지갑 조회 실패 등으로 중단했다. 다음 실행이 같은 범위를 다시 본다
 */
export type ReconciliationStatus = 'RUNNING' | 'COMPLETED' | 'INCOMPLETE'

/** SCHEDULED 매일 배치 / MANUAL 관리자 실행 */
export type ReconciliationTrigger = 'SCHEDULED' | 'MANUAL'

/**
 * 어긋난 이유. HP_TASK_DEAD는 어긋남이 아니라 멈춘(DEAD) HP 작업이 있어 비교하지 않았다는 표시다.
 * HP_TASK_MISMATCH는 출연에만 있다(상태로 계산한 기대값과 끝난 HP 작업의 합이 다름).
 */
export type ReconciliationRule =
  | 'HOLD_MISSING'
  | 'HOLD_MISMATCH'
  | 'HOLD_BALANCE_MISMATCH'
  | 'HOLD_NOT_CLOSED'
  | 'VOIDED_WHILE_ACTIVE'
  | 'SETTLEMENT_MISSING'
  | 'SETTLEMENT_MISMATCH'
  | 'SETTLEMENT_UNEXPECTED'
  | 'WALLET_ONLY_HOLD'
  | 'HP_TASK_DEAD'
  | 'HP_TASK_MISMATCH'

/** 출연 지갑 참조 유형: 출연 요청서 / 출연 모집글 */
export type AppearanceReferenceType =
  'APPEARANCE_REQUEST' | 'APPEARANCE_RECRUIT'

type MismatchBase = {
  id: number
  rule: ReconciliationRule
  /** 지갑 쪽 상태 요약(BE가 만든 문장). 그대로 보인다 */
  walletState: string
}

/** 강의 어긋난 건 (BE LectureHpReconciliationMismatchResponse) */
export type LectureMismatch = MismatchBase & {
  /** 주문 항목 ID(지갑 참조 ID) */
  orderItemId: number
  /** 지갑에만 있는 보류(WALLET_ONLY_HOLD)는 강의에 항목이 없어 null */
  orderId: number | null
  /** 비교할 때의 항목 상태. 지갑에만 있는 보류는 null */
  itemStatus: OrderItemStatus | null
  /** 강의 쪽 상태 요약(BE가 만든 문장) */
  lectureState: string
}

/** 출연 어긋난 건 (BE HpReconciliationMismatchResDto) */
export type AppearanceMismatch = MismatchBase & {
  referenceType: AppearanceReferenceType
  /** 요청서·모집글 ID */
  referenceId: number
  /** 지급 건처럼 출연 하나에 걸린 어긋남이면 그 출연 ID */
  appearanceId: number | null
  /** 출연 쪽 상태 요약(BE가 만든 문장) */
  appearanceState: string
}

/** 실행 한 번과 어긋난 건(두 앱 같은 모양). 시각은 시간대 없는 KST다 */
export type ReconciliationRun<M> = {
  id: number
  triggerType: ReconciliationTrigger
  /** 수동 실행한 관리자 회원 ID. 배치면 null */
  triggeredBy: number | null
  status: ReconciliationStatus
  startedAt: string
  /** 실행 중이면 null */
  finishedAt: string | null
  /** 비교한 주문 항목(강의)·요청서·모집글(출연) 수 */
  checkedCount: number
  /** 어긋난 건 수(HP_TASK_DEAD 표시 제외) */
  mismatchCount: number
  /** 멈춘 HP 작업이 있어 표시만 한 수 */
  deadCount: number
  /** 끝까지 비교하지 못한 이유. 완료면 null */
  failureReason: string | null
  /** 어긋난 건과 HP_TASK_DEAD 표시(남긴 순서). 실행 중이면 비어 있다 */
  mismatches: M[]
}

export type LectureReconciliationRun = ReconciliationRun<LectureMismatch>
export type AppearanceReconciliationRun = ReconciliationRun<AppearanceMismatch>
