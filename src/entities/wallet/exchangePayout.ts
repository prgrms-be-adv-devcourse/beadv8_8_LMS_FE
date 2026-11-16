/**
 * 관리자 환전 송금 처리 규칙. 검사는 BE(EXCHANGE_PAYOUT_NOT_CHECKABLE·NOT_RETRYABLE·NOT_FINALIZABLE·
 * EXCHANGE_FINAL_FAILURE_REASON_INVALID)와 같고, 최종 판단은 BE가 한다.
 */
import type {
  AdminExchangePayout,
  ExchangePayoutStatus,
  ExchangeStatus,
} from './types'

export const FINAL_FAILURE_REASON_MAX = 500

/**
 * 송금 확인 목록의 상태 필터. 기본은 자동 처리가 멈춘 운영자 확인 대상이다.
 * 결과를 아직 모르는 시도(결과 불명·결과 대기)도 볼 수 있다. 송금이 확정 실패한 환전은 환전 목록의 송금 실패에서 본다.
 */
export const ADMIN_PAYOUT_FILTERS = [
  {
    status: 'MANUAL_REVIEW_REQUIRED',
    label: '운영자 확인',
    empty: '운영자 확인이 필요한 송금이 없어요',
  },
  {
    status: 'UNKNOWN',
    label: '결과 불명',
    empty: '결과를 모르는 송금이 없어요',
  },
  {
    status: 'PROCESSING',
    label: '결과 대기',
    empty: '결과를 기다리는 송금이 없어요',
  },
] as const satisfies readonly {
  status: ExchangePayoutStatus
  label: string
  empty: string
}[]

export type AdminPayoutFilter = (typeof ADMIN_PAYOUT_FILTERS)[number]['status']

/** 결과가 확정되지 않아 은행에 다시 확인할 수 있는 시도 상태 */
const CHECKABLE: readonly string[] = [
  'PROCESSING',
  'UNKNOWN',
  'MANUAL_REVIEW_REQUIRED',
] satisfies ExchangePayoutStatus[]

/** 마지막 시도(시도 번호가 가장 큰 것). 시도가 없으면 null */
export function latestPayout(
  attempts: readonly AdminExchangePayout[],
): AdminExchangePayout | null {
  return attempts.reduce<AdminExchangePayout | null>(
    (latest, attempt) =>
      !latest || attempt.attemptNo > latest.attemptNo ? attempt : latest,
    null,
  )
}

/** 마지막 시도의 결과가 확정되지 않았으면 결과를 다시 확인할 수 있다 */
export function isPayoutCheckable(status: ExchangePayoutStatus): boolean {
  return CHECKABLE.includes(status)
}

/** 송금이 확정 실패한(FAILED) 환전만 재송금하거나 최종 실패로 끝낼 수 있다 */
export function isPayoutDecidable(status: ExchangeStatus): boolean {
  return status === 'FAILED'
}

/** 송금 단계에 들어갈 수 있는 환전인지. 승인 대기·거절·회원 취소는 송금 시도가 없다 */
export function hasPayoutStage(status: ExchangeStatus): boolean {
  return !['REQUESTED', 'REJECTED', 'CANCELED'].includes(status)
}

/** 앞뒤 공백을 뺀 1~500자 */
export function finalFailureReasonError(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed.length === 0) return '최종 실패 사유를 입력해 주세요.'
  if (trimmed.length > FINAL_FAILURE_REASON_MAX)
    return `최종 실패 사유는 ${FINAL_FAILURE_REASON_MAX}자까지 입력할 수 있어요.`
  return null
}
