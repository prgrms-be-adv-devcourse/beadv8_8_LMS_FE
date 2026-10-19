import { formatNumber } from '@/shared/lib/money'
import type { PointChange, WalletTransaction } from './types'

/** +1,000 / −1,000 (빼기는 U+2212). 0은 부호 없이 쓴다. */
export function formatSignedHp(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`
}

const changed = (change: PointChange) =>
  change.availableChangeHp !== 0 ||
  change.heldChangeHp !== 0 ||
  change.totalChangeHp !== 0

/** 거래에서 바뀐 HP 종류(충전·수익). 색 점으로 구분해 보여 준다. */
export function changedBuckets(
  tx: WalletTransaction,
): ('charge' | 'revenue')[] {
  return [
    ...(changed(tx.charge) ? (['charge'] as const) : []),
    ...(changed(tx.revenue) ? (['revenue'] as const) : []),
  ]
}

/**
 * 거래가 가리키는 화면. 출연 요청서·모집글만 연결한다.
 * 강의 주문 항목·모집 출연·충전·환불·환전·지급은 회원이 볼 상세 화면이 없거나 ID로 찾을 수 없다.
 */
export function transactionLink(
  tx: WalletTransaction,
): { to: string; label: string } | null {
  switch (tx.referenceType) {
    case 'APPEARANCE_REQUEST':
      return {
        to: `/appearances/requests/${tx.referenceId}`,
        label: '출연 요청서 보기',
      }
    case 'APPEARANCE_RECRUIT':
      return { to: `/recruits/${tx.referenceId}`, label: '모집글 보기' }
    default:
      return null
  }
}
