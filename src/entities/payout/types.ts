/** GET /lectures/admin/payout-failures 한 줄: 지급 실패 기록이 있는 미지급(구매 확정) 주문 항목 */
export type PayoutFailure = {
  orderItemId: number
  orderId: number
  lectureId: number
  sellerUserId: number
  buyerUserId: number
  /** 지급할 HP (주문 시점 가격) */
  priceHp: number
  /** 지급 예정 시각 (구매일 + 31일 00:00 KST) */
  payoutScheduledAt: string
  /** 지급 실패 횟수. 격리를 해제해도 이력으로 남는다 */
  payoutFailureCount: number
  /** 마지막 실패 코드: billing 오류 코드, PAYOUT_AMOUNT_MISMATCH, 또는 예외 클래스 이름(일시 오류) */
  lastPayoutFailureCode: string
  lastPayoutFailedAt: string
  /** 격리 시각. 있으면 지급 배치가 처리하지 않는다(관리자 해제 필요), null이면 다음 배치에서 자동으로 다시 시도 */
  payoutQuarantinedAt: string | null
}
