import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { ExchangePayoutStatus } from '../types'

const LABEL: Record<ExchangePayoutStatus, StatusLabel> = {
  PENDING: ['mute', '송금 전'],
  PROCESSING: ['warn', '결과 대기'],
  COMPLETED: ['ok', '송금 성공'],
  FAILED: ['bad', '송금 실패'],
  UNKNOWN: ['warn', '결과 불명'],
  MANUAL_REVIEW_REQUIRED: ['bad', '운영자 확인'],
}

/** 송금 시도 하나의 상태 */
export function ExchangePayoutStatusPill({
  status,
}: {
  status: ExchangePayoutStatus
}) {
  const [tone, label] = statusOf(LABEL, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
