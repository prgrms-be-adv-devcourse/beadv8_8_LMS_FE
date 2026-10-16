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

/**
 * 환불 요청 상태 (BE PointRefundRequestStatus).
 * REQUESTED 접수(PG 취소 전, 회원이 취소 가능), PROCESSING 결제 취소 진행·결과 확인 중,
 * COMPLETED 전부 환불, PARTIALLY_COMPLETED 일부 환불(나머지 반환), FAILED 환불 없이 전부 반환,
 * MANUAL_REVIEW_REQUIRED 운영자 확인(해당 금액 보류 유지), CANCELED 회원이 PG 취소 전에 취소(전부 반환).
 */
export type RefundStatus =
  | 'REQUESTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'CANCELED'

/** 충전 건(PG 결제 건) 하나의 취소 상태 (BE PointRefundStatus) */
export type RefundItemStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'CANCELED'

export type RefundItem = {
  refundId: number
  amount: number
  status: RefundItemStatus
  completedAt: string | null
  failedAt: string | null
}

/** 환불 요청 (BE RefundResponse). 금액은 서버 값을 그대로 표시한다(FE가 배분·반환액을 계산하지 않는다). */
export type Refund = {
  refundRequestId: number
  /** 요청 금액 */
  requestedAmount: number
  /** 환불(PG 취소 성공) 금액 */
  completedAmount: number
  /** 환불하지 못해 충전 HP로 반환한 금액 */
  returnedAmount: number
  /** 아직 보류 중인 금액(결과 확인 중·운영자 확인) */
  pendingAmount: number
  status: RefundStatus
  requestedAt: string
  completedAt: string | null
  canceledAt: string | null
  /** 결제 건별 취소(FIFO 순서). 화면에는 쓰지 않는다. */
  items: RefundItem[]
}
