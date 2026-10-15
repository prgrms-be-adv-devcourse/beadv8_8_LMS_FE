import { CATEGORY_LABEL, STATUS_LABEL } from '../category'
import type { InquiryCategory, InquiryStatus, ObjectionResult } from '../types'

export function InquiryStatusPill({ status }: { status: InquiryStatus }) {
  return (
    <span className={status === 'ANSWERED' ? 'pill ok' : 'pill warn'}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function CategoryPill({ category }: { category: InquiryCategory }) {
  return <span className="pill mute">{CATEGORY_LABEL[category]}</span>
}

export function ObjectionResultPill({ result }: { result: ObjectionResult }) {
  return result === 'ACCEPTED' ? (
    <span className="pill info">이의 제기 인정 · 구매자 반환</span>
  ) : (
    <span className="pill mute">이의 제기 기각 · 판매자 지급</span>
  )
}
