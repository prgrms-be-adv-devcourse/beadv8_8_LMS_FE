import type { OrderItem } from './types'

/** 결제가 끝난 항목의 구매일과 기한. 결제 단계 항목은 아직 없어서 undefined다 */
export function purchaseDatesOf({
  purchasedAt,
  autoConfirmAt,
  payoutScheduledAt,
}: OrderItem) {
  return purchasedAt && autoConfirmAt && payoutScheduledAt
    ? { purchasedAt, autoConfirmAt, payoutScheduledAt }
    : undefined
}
