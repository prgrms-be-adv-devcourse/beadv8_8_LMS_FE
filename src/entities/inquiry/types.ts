/** 문의 유형. 강의 내용 다름 이의 제기만 대상(강의 주문 항목)을 함께 받는다 */
export type InquiryCategory =
  'NO_SHOW_REPORT' | 'LECTURE_CONTENT_DISPUTE' | 'SERVICE_COMPLAINT' | 'OTHER'

/** 답변을 달면 ANSWERED, 답변을 모두 지우면 다시 WAITING */
export type InquiryStatus = 'WAITING' | 'ANSWERED'

export type InquirySort = 'LATEST' | 'OLDEST'

/** 강의 내용 다름 이의 제기 판단: 인정(구매자에게 반환) / 기각(판매자에게 지급) */
export type ObjectionResult = 'ACCEPTED' | 'REJECTED'

/**
 * 이의 제기의 강의 연동 상태(BE #279, D60·D71). 이의 제기 문의에만 있다.
 * FILING → FILED(접수됨, 판매자 지급이 멈춤) 또는 FILE_REJECTED(접수 불가).
 * FILED → RESOLUTION_PENDING → RESOLVED(판단 반영) 또는 RESOLUTION_FAILED(강의가 거절).
 * FILED → WITHDRAWAL_PENDING → WITHDRAWN(문의 삭제) 또는 WITHDRAWAL_FAILED(강의가 거절).
 * *_FAILED는 운영 복구(BE #267)를 기다린다.
 */
export type ObjectionLinkStatus =
  | 'FILING'
  | 'FILED'
  | 'FILE_REJECTED'
  | 'RESOLUTION_PENDING'
  | 'RESOLVED'
  | 'RESOLUTION_FAILED'
  | 'WITHDRAWAL_PENDING'
  | 'WITHDRAWN'
  | 'WITHDRAWAL_FAILED'

/** 인정한 이의 제기의 HP 반환 상태. PENDING → COMPLETED, 자동 처리가 멈추면 ACTION_REQUIRED. 되돌아가지 않는다 */
export type HpReturnStatus = 'PENDING' | 'ACTION_REQUIRED' | 'COMPLETED'

/** 목록 한 줄 */
export type InquirySummary = {
  inquiryId: number
  userId: number
  category: InquiryCategory
  title: string
  status: InquiryStatus
  createdAt: string
}

/** 관리자 답변 (답변한 관리자는 회원에게 보이지 않는다) */
export type InquiryReply = {
  replyId: number
  content: string
  createdAt: string
}

/** 상세 (답변은 오래된 순) */
export type Inquiry = InquirySummary & {
  content: string
  replies: InquiryReply[]
  /** 강의 내용 다름 이의 제기만 'LECTURE_ORDER_ITEM' */
  targetType: 'LECTURE_ORDER_ITEM' | null
  /** 강의 주문 항목 ID */
  targetId: number | null
  objectionResult: ObjectionResult | null
  objectionResolvedAt: string | null
  /** 이의 제기가 아니면 null */
  objectionLinkStatus: ObjectionLinkStatus | null
  /** 인정한 이의 제기에만 있다 */
  hpReturnStatus: HpReturnStatus | null
  /** 서버가 정한 사용자 안내. 접수 불가면 "접수 불가 · 사유", 판단·철회를 강의가 거절했으면 "처리 지연 · 확인 중" */
  objectionNotice: string | null
  /** 강의 거절 사유 코드. 관리자 응답에만 있다 */
  objectionFailureCode: string | null
  /** 지금(마지막으로) 강의에 보낸 명령 ID(예: RESOLVE:12). 관리자 응답에만 있다 */
  objectionCommandId: string | null
}

export type InquiryInput = {
  category: InquiryCategory
  title: string
  content: string
  /** 강의 내용 다름 이의 제기에만 */
  orderItemId?: number
}
