import type { RefundStatus } from '../types'

const LABEL: Record<RefundStatus, [tone: string, label: string]> = {
  COMPLETED: ['ok', '환불 완료'],
  PARTIALLY_COMPLETED: ['warn', '일부 환불'],
  FAILED: ['bad', '환불 실패'],
  PROCESSING: ['warn', '처리 중'],
  REQUESTED: ['warn', '접수됨'],
  MANUAL_REVIEW_REQUIRED: ['warn', '운영자 확인 중'],
  CANCELED: ['mute', '신청 취소'],
}

export function RefundStatusPill({ status }: { status: RefundStatus }) {
  const [tone, label] = LABEL[status]
  return (
    <span className={`pill ${tone}`}>
      {status === 'PROCESSING' && (
        <span className="spinner xs" aria-hidden="true" />
      )}
      {label}
    </span>
  )
}
