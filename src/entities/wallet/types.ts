import type { Role } from '@/shared/auth/role'

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
 * REQUESTED 관리자 승인 전(회원이 취소 가능), APPROVED 관리자 승인(보류 유지·송금 대기, 취소 불가),
 * REJECTED 관리자 거절(보류 HP 반환), CANCELED 회원 취소(보류 HP 반환).
 * PROCESSING·COMPLETED·FAILED·UNKNOWN은 송금 단계(BE 후속 기능)다.
 */
export type ExchangeStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'CANCELED'

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

/** 신청자의 현재 회원 정보(BE Billing 회원 복제본). 신청 당시가 아니라 지금 값이다. */
export type ExchangeApplicant = {
  nickname: string
  role: Role
  status: 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'
  /** 정상(ACTIVE) 상태의 인플루언서·인증된 인플루언서라 승인할 수 있는지(BE 판단) */
  approvable: boolean
}

/** 관리자용 환전 신청 (BE AdminExchangeResponse). 금액은 신청 때 BE가 확정한 값이다. */
export type AdminExchange = {
  exchangeId: number
  /** 신청자 회원 ID */
  userId: number
  requestedAmount: number
  feeRate: number
  feeAmount: number
  /** 예상 수령액(원) = 신청 금액 − 수수료 */
  expectedPayoutAmount: number
  status: ExchangeStatus
  /** 잠정 정산 예정일(KST 날짜). 승인해도 바뀌지 않는다. */
  settlementRoundDate: string
  requestedAt: string
  canceledAt: string | null
  /** 승인한 관리자 회원 ID */
  approvedBy: number | null
  approvedAt: string | null
  /** 거절한 관리자 회원 ID */
  rejectedBy: number | null
  rejectedAt: string | null
  /** 신청자에게 보이는 거절 사유 */
  rejectionReason: string | null
  account: ExchangeAccount
  /** 복제본이 없으면 null이고 그 신청은 승인할 수 없다(409 EXCHANGE_APPLICANT_NOT_SYNCED). */
  applicant: ExchangeApplicant | null
}

/**
 * 내 HP 거래 유형 (BE WalletTransactionType). 화면 문구는 BE displayName을 쓴다.
 * 보류(가용 → 보류)와 확정(보류 차감)은 서로 다른 거래다.
 */
export type WalletTransactionType =
  | 'CHARGE'
  | 'PAYMENT_HOLD'
  | 'PAYMENT_RELEASE'
  | 'PAYMENT_SETTLED'
  | 'PENALTY_PAID'
  | 'EARNING_RECEIVED'
  | 'PENALTY_RECEIVED'
  | 'REFUND_HOLD'
  | 'REFUND_RELEASE'
  | 'REFUND'
  | 'EXCHANGE_HOLD'
  | 'EXCHANGE_RELEASE'
  | 'EXCHANGE'
  | 'REVERSAL'

/** 거래가 가리키는 대상 (BE BillingReferenceType) */
export type BillingReferenceType =
  | 'LECTURE_ORDER'
  | 'LECTURE_ORDER_ITEM'
  | 'APPEARANCE_REQUEST'
  | 'APPEARANCE_RECRUIT'
  | 'RECRUIT_APPEARANCE'
  | 'POINT_CHARGE'
  | 'POINT_REFUND_REQUEST'
  | 'EXCHANGE'
  | 'SETTLEMENT'

/** HP 증감 (부호 그대로). total = available + held */
export type PointChange = {
  availableChangeHp: number
  heldChangeHp: number
  totalChangeHp: number
}

/** 내 HP 거래 하나 (BE WalletTransactionResponse). 증감은 충전 HP(charge)와 수익 HP(revenue)를 합친 값이다. */
export type WalletTransaction = PointChange & {
  transactionId: number
  type: WalletTransactionType
  /** 사용자용 거래 이름 (예: HP 충전, 결제 보류) */
  displayName: string
  referenceType: BillingReferenceType
  referenceId: number
  /** UTC Instant */
  occurredAt: string
  charge: PointChange
  revenue: PointChange
}

/**
 * 수익 상태 (BE EarningStatus). 앞의 다섯은 아직 지급하지 않은 상태다.
 * CONFIRMATION_PENDING 구매·출연 확인 대기, SCHEDULED 지급 예정, ON_HOLD 보류, PROCESSING 지급 처리 중,
 * FAILED 지급 실패, COMPLETED 지급 완료, CANCELED 취소.
 */
export type EarningStatus =
  | 'CONFIRMATION_PENDING'
  | 'SCHEDULED'
  | 'ON_HOLD'
  | 'PROCESSING'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELED'

export type EarningType =
  'LECTURE_SALE' | 'APPEARANCE_FEE' | 'APPEARANCE_PENALTY'

/** 지급 예정 수익 하나 (BE EarningItemResponse). 강의 판매·출연 수익을 합친 목록의 항목이다. */
export type Earning = {
  sourceType: 'LECTURE' | 'APPEARANCE'
  sourceId: number
  earningType: EarningType
  title: string
  amountHp: number
  status: EarningStatus
  /** 지급 예정 시각(UTC). 정할 수 없으면 null */
  payoutScheduledAt: string | null
  statusUpdatedAt: string
}

export type EarningAmount = { amountHp: number; count: number }

/** 아직 지급하지 않은 수익의 상태별 합계 (BE EarningSummaryResponse). 합계도 BE 값을 그대로 쓴다. */
export type EarningSummary = {
  confirmationPending: EarningAmount
  scheduled: EarningAmount
  onHold: EarningAmount
  processing: EarningAmount
  failed: EarningAmount
  total: EarningAmount
  /** 조회 시작 시각(UTC) */
  asOf: string
}
