import type { InquiryCategory, InquiryStatus } from './types'

export const INQUIRY_TITLE_MAX = 100

export const CATEGORY_LABEL: Record<InquiryCategory, string> = {
  NO_SHOW_REPORT: '노쇼 신고',
  LECTURE_CONTENT_DISPUTE: '강의 내용 다름 이의 제기',
  SERVICE_COMPLAINT: '서비스 불만',
  OTHER: '기타',
}

/** 유형별 안내 (정책: 노쇼 신고는 방송 다음 날부터 3일, 강의 이의 제기는 구매 다음 날부터 30일) */
export const CATEGORY_HINT: Record<InquiryCategory, string> = {
  NO_SHOW_REPORT:
    '방송 예정일 다음 날부터 3일 안에 신고할 수 있어요. 어떤 출연인지 내용에 함께 적어 주세요.',
  LECTURE_CONTENT_DISPUTE:
    '구매일 다음 날부터 30일 안에 접수할 수 있어요. 접수되면 판매자 지급이 멈추고, 관리자 판단에 따라 반환 또는 지급돼요.',
  SERVICE_COMPLAINT: '불편했던 점을 자세히 적어 주세요.',
  OTHER: '',
}

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as InquiryCategory[]

export function isInquiryCategory(
  value: string | null,
): value is InquiryCategory {
  return value !== null && (CATEGORIES as string[]).includes(value)
}

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  WAITING: '답변 대기',
  ANSWERED: '답변 완료',
}
