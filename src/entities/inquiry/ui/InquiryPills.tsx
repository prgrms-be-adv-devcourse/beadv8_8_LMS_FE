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

const OBJECTION_RESULT: Record<ObjectionResult, StatusLabel> = {
  ACCEPTED: ['info', '이의 제기 인정 · 구매자 반환'],
  REJECTED: ['mute', '이의 제기 기각 · 판매자 지급'],
}

/** 모르는 결과를 지급 확정처럼 보이지 않게 표에서 고른다 */
export function ObjectionResultPill({ result }: { result: ObjectionResult }) {
  const [tone, label] = statusOf(OBJECTION_RESULT, result)
  return <span className={`pill ${tone}`}>{label}</span>
}
