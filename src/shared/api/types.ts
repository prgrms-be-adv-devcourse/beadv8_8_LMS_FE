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
}
