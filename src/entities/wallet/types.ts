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

/**
 * 환전 신청 상태 (BE ExchangeStatus).
 * REQUESTED 관리자 승인 전(회원이 취소 가능), CANCELED 회원 취소(보류 HP 반환).
 * PROCESSING·COMPLETED·FAILED·UNKNOWN은 송금 단계(BE 후속 기능)다.
 */
export type ExchangeStatus =
  'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'UNKNOWN' | 'CANCELED'

/** 신청 당시 입력한 테스트 계좌(이후 바뀌지 않는다). 계좌번호는 끝 4자리만 보인다. */
export type ExchangeAccount = {
  bankCode: string
  /** 예: **********1234 */
  accountNumberMasked: string
  accountHolderName: string
  /** 실제 계좌 확인을 하지 않아 PENDING이다. 화면에는 쓰지 않는다. */
  verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED'
}

/** 환전 신청 (BE ExchangeResponse). 수수료·예상 수령액은 신청 때 BE가 확정한 값을 그대로 표시한다. */
export type Exchange = {
  exchangeId: number
  /** 신청 금액(수익 HP, 보류한 금액) */
  requestedAmount: number
  /** 0.1 = 10% */
  feeRate: number
  feeAmount: number
  /** 예상 수령액(원) = 신청 금액 − 수수료 */
  expectedPayoutAmount: number
  status: ExchangeStatus
  /** 잠정 정산 예정일(KST 날짜, 예: 2026-10-12). 공휴일을 반영하지 않아 실제 송금일이 아니다. */
  settlementRoundDate: string
  requestedAt: string
  canceledAt: string | null
  completedAt: string | null
  failedAt: string | null
  account: ExchangeAccount
}

/** POST /settlements/exchanges 본문 */
export type ExchangeRequest = {
  amount: number
  bankCode: string
  accountNumber: string
  accountHolderName: string
}
