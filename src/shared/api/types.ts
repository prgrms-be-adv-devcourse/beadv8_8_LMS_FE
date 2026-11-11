/** 성공 응답 본문 (BE global RsData) */
export type RsData<T> = {
  statusCode: number
  message: string
  data: T
}

/** 페이지 응답 (Spring PagedModel). 요청은 page(0부터)·size(최대 100)·sort */
export type PagedModel<T> = {
  content: T[]
  page: {
    size: number
    number: number
    totalElements: number
    totalPages: number
  }
}

/** 오류 응답 본문 (RFC 9457 ProblemDetail + BE 확장 필드) */
export type ProblemDetail = {
  status: number
  detail?: string
  /** 화면이 분기하는 식별자 (모듈 ErrorCode enum 이름) */
  code?: string
  /** 요청 값 오류일 때만 */
  errors?: { field: string; message: string }[]
  /** HP 충전 승인 거절(CHARGE_PAYMENT_REJECTED)일 때 PG 오류 코드 또는 PG 결제 상태 */
  pgCode?: string | null
  /** 회원 탈퇴가 막혔을 때(WITHDRAWAL_BLOCKED) 정리할 항목 */
  reasons?: { code: string; message: string; availableAt?: string | null }[]
  /** 탈퇴 회원 로그인(WITHDRAWN_RESTORABLE)일 때 복구할 수 있는 마지막 시각(LocalDateTime, KST) */
  restorableUntil?: string
  /** 쿠폰을 쓴 주문이 거절됐을 때(COUPON_CALCULATION_REJECTED·COUPON_RESERVATION_REJECTED) 쿠폰 모듈의 오류 코드 */
  couponCode?: string
  /** 그 오류가 특정 쿠폰 때문일 때 그 회원 쿠폰 ID(주문 거절·미리보기 오류) */
  memberCouponId?: number | null
  /**
   * 쿠폰 계산 거절(COUPON_CALCULATION_REJECTED)에서 쿠폰이 준, 회원에게 보여도 되는 사유 코드.
   * 지금은 PLATFORM_FUNDING_DISABLED(플랫폼 재원이 없어 플랫폼 쿠폰을 쓸 수 없음)만 온다
   */
  couponDetail?: string
}
