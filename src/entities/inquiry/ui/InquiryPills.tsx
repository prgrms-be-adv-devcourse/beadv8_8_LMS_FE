import {
  lookup,
  statusOf,
  UNKNOWN_NAME,
  type StatusLabel,
} from '@/shared/lib/statusLabel'
import { CATEGORY_LABEL, STATUS_LABEL } from '../category'
import type {
  HpReturnStatus,
  InquiryCategory,
  InquiryStatus,
  ObjectionLinkStatus,
  ObjectionResult,
} from '../types'

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

/** 이름은 BE ObjectionLinkStatus 라벨과 같다 */
const OBJECTION_LINK: Record<ObjectionLinkStatus, StatusLabel> = {
  FILING: ['warn', '접수 처리 중'],
  FILED: ['info', '접수됨'],
  FILE_REJECTED: ['mute', '접수 불가'],
  RESOLUTION_PENDING: ['warn', '판단 처리 중'],
  RESOLVED: ['ok', '판단 완료'],
  RESOLUTION_FAILED: ['bad', '판단 처리 지연'],
  WITHDRAWAL_PENDING: ['warn', '철회 처리 중'],
  WITHDRAWN: ['mute', '철회됨'],
  WITHDRAWAL_FAILED: ['bad', '철회 처리 지연'],
}

/** 이의 제기의 강의 연동 상태(관리자 상세) */
export function ObjectionLinkPill({ status }: { status: ObjectionLinkStatus }) {
  const [tone, label] = statusOf(OBJECTION_LINK, status)
  return <span className={`pill ${tone}`}>{label}</span>
}

/** 이름은 BE HpReturnStatus 라벨에 HP를 붙였다(판단 결과 배지와 나란히 보인다) */
const HP_RETURN: Record<HpReturnStatus, StatusLabel> = {
  PENDING: ['warn', 'HP 반환 처리 중'],
  ACTION_REQUIRED: ['bad', 'HP 반환 지연 · 확인 중'],
  COMPLETED: ['ok', 'HP 반환 완료'],
}

/** 인정한 이의 제기의 HP 반환 상태 */
export function HpReturnPill({ status }: { status: HpReturnStatus }) {
  const [tone, label] = statusOf(HP_RETURN, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
