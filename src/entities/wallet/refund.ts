/** 충전 HP 환불 규칙. 금액 검사는 BE(REFUND_AMOUNT_INVALID·INSUFFICIENT_BALANCE)와 같고, 최종 판단은 BE가 한다. */
import { formatNumber } from '@/shared/lib/money'
import type { RefundStatus } from './types'

export const REFUND_UNIT = 1_000
/** 입력은 9자리까지만 받는다(숫자 넘침 방지). */
export const REFUND_INPUT_MAX_DIGITS = 9

/**
 * 처리 중(REQUESTED·PROCESSING)일 때 상태를 다시 보는 간격·횟수 (15초 × 24번 = 6분).
 * 결과를 모르는 결제 취소는 BE 결과 확인 배치(5분마다)가 확정하므로, 배치가 한 번은 돌 만큼 기다린다.
 */
export const REFUND_POLL_INTERVAL_MS = 15_000
export const REFUND_POLL_MAX = 24

export function refundAmountError(
  amount: number,
  chargeBalance: number,
): string | null {
  if (amount <= 0) return '환불할 금액을 입력해 주세요.'
  if (amount < REFUND_UNIT) return '최소 1,000 HP부터 환불할 수 있어요.'
  if (amount % REFUND_UNIT !== 0) return '1,000 HP 단위로 입력해 주세요.'
  if (amount > chargeBalance)
    return `충전 HP(${formatNumber(chargeBalance)})까지만 환불할 수 있어요.`
  return null
}

/** 환불 모달의 처음 금액: 충전 HP 전액을 1,000 단위로 내린 값 */
export function defaultRefundAmount(chargeBalance: number): number {
  return Math.floor(chargeBalance / REFUND_UNIT) * REFUND_UNIT
}

/** 최소 금액(1,000 HP)보다 적으면 환불을 신청할 수 없다. */
export function canRefund(chargeBalance: number): boolean {
  return chargeBalance >= REFUND_UNIT
}

/** 아직 결과가 정해지지 않아 상태를 다시 볼 상태. MANUAL_REVIEW_REQUIRED는 운영자가 처리하므로 보지 않는다. */
export function isRefundPending(status: RefundStatus): boolean {
  return status === 'REQUESTED' || status === 'PROCESSING'
}
