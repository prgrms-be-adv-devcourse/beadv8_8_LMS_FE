import {
  lookup,
  statusOf,
  UNKNOWN_NAME,
  type StatusLabel,
} from '@/shared/lib/statusLabel'
import { CATEGORY_LABEL, STATUS_LABEL } from '../category'
import type { InquiryCategory, InquiryStatus, ObjectionResult } from '../types'

const STATUS: Record<InquiryStatus, StatusLabel> = {
  WAITING: ['warn', STATUS_LABEL.WAITING],
  ANSWERED: ['ok', STATUS_LABEL.ANSWERED],
}

export function InquiryStatusPill({ status }: { status: InquiryStatus }) {
  const [tone, label] = statusOf(STATUS, status)
  return <span className={`pill ${tone}`}>{label}</span>
}

export function CategoryPill({ category }: { category: InquiryCategory }) {
  return (
    <span className="pill mute">
      {lookup(CATEGORY_LABEL, category) ?? UNKNOWN_NAME}
    </span>
  )
}

export function ObjectionResultPill({ result }: { result: ObjectionResult }) {
  return result === 'ACCEPTED' ? (
    <span className="pill info">이의 제기 인정 · 구매자 반환</span>
  ) : (
    <span className="pill mute">이의 제기 기각 · 판매자 지급</span>
  )
}
