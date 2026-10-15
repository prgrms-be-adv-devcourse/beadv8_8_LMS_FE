/** 문의 유형. 강의 내용 다름 이의 제기만 대상(강의 주문 항목)을 함께 받는다 */
export type InquiryCategory =
  'NO_SHOW_REPORT' | 'LECTURE_CONTENT_DISPUTE' | 'SERVICE_COMPLAINT' | 'OTHER'

/** 답변을 달면 ANSWERED, 답변을 모두 지우면 다시 WAITING */
export type InquiryStatus = 'WAITING' | 'ANSWERED'

export type InquirySort = 'LATEST' | 'OLDEST'

/** 강의 내용 다름 이의 제기 판단: 인정(구매자에게 반환) / 기각(판매자에게 지급) */
export type ObjectionResult = 'ACCEPTED' | 'REJECTED'

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
}

export type InquiryInput = {
  category: InquiryCategory
  title: string
  content: string
  /** 강의 내용 다름 이의 제기에만 */
  orderItemId?: number
}
