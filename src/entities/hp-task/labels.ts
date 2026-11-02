import type {
  HpAttemptResult,
  HpTaskOutcome,
  HpTaskPurpose,
  HpTaskStatus,
  HpTaskType,
} from './types'

/** 관리자 목록의 상태 필터. 기본은 관리자가 처리할 멈춘 작업이다. 전체는 상태를 보내지 않는다 */
export const HP_TASK_STATUS_FILTERS = [
  { status: 'DEAD', label: '멈춤', empty: '자동 처리가 멈춘 작업이 없어요' },
  {
    status: 'PENDING',
    label: '대기',
    empty: '다음 시도를 기다리는 작업이 없어요',
  },
  { status: 'PROCESSING', label: '처리 중', empty: '처리 중인 작업이 없어요' },
  { status: 'COMPLETED', label: '완료', empty: '끝난 작업이 없어요' },
  { status: 'ALL', label: '전체', empty: 'HP 작업이 없어요' },
] as const satisfies readonly {
  status: HpTaskStatus | 'ALL'
  label: string
  empty: string
}[]

export type HpTaskStatusFilter =
  (typeof HP_TASK_STATUS_FILTERS)[number]['status']

export const HP_TASK_TYPE_LABEL: Record<HpTaskType, string> = {
  HOLD: '보류',
  RELEASE: '반환',
  PAYOUT: '지급',
}

export const HP_TASK_PURPOSE_LABEL: Record<HpTaskPurpose, string> = {
  ORDER_HOLD: '주문 보류',
  HOLD_COMPENSATION: '보류 보상 반환',
  CANCEL: '구매 취소 반환',
  RETURN: '이의 제기 인정 반환',
  PAYOUT: '판매자 지급',
}

export const HP_TASK_OUTCOME_LABEL: Record<HpTaskOutcome, string> = {
  SUCCEEDED: '성공',
  REJECTED: '거절(잔액 부족)',
  SKIPPED: '건너뜀(필요 없어진 보류)',
}

export const HP_ATTEMPT_RESULT_LABEL: Record<HpAttemptResult, string> = {
  SUCCEEDED: '성공',
  TERMINAL_REJECTION: '확정 거절',
  RETRYABLE: '처리 안 됨(재시도)',
  UNKNOWN_RESULT: '결과 모름(재시도)',
  INVARIANT_VIOLATION: '있어서는 안 되는 결과',
  LEASE_EXPIRED: '처리 시간 만료',
}
