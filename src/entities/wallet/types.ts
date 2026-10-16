/** GET /wallets/me (BE WalletResponse). 금액은 모두 서버 값을 그대로 표시한다. */
export type Wallet = {
  walletId: number
  /** 충전 HP (환불 가능) */
  chargeBalanceHp: number
  /** 수익 HP (환전 가능) */
  revenueBalanceHp: number
  heldChargeHp: number
  heldRevenueHp: number
  /** 충전 HP + 수익 HP */
  availableTotalHp: number
  /** 보류 HP 합계 */
  heldTotalHp: number
}

/**
 * 충전 주문 상태 (BE PointChargeStatus).
 * PENDING 결제 전, PROCESSING 승인 결과 확인 중, COMPLETED 충전됨, FAILED 결제 미승인.
 * PARTIALLY_REFUNDED·REFUNDED는 충전 뒤 환불한 경우다.
 */
export type ChargeStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'

/** 충전 주문 (BE ChargeResponse). orderId·orderName·amount를 결제창에 그대로 넘긴다. */
export type ChargeOrder = {
  orderId: string
  /** 결제창 주문명 (예: HP 10,000 충전) */
  orderName: string
  /** 충전 금액 (HP = 원) */
  amount: number
  status: ChargeStatus
  requestedAt: string
  completedAt: string | null
  failedAt: string | null
  /** FAILED일 때 PG가 알려 준 실패 사유 */
  failureReason: string | null
}
