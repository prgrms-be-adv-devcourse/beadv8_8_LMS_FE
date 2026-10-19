import type { EarningStatus } from '../types'

const LABEL: Record<EarningStatus, [tone: string, label: string]> = {
  CONFIRMATION_PENDING: ['warn', '확인 대기'],
  SCHEDULED: ['ok', '지급 예정'],
  ON_HOLD: ['warn', '보류'],
  PROCESSING: ['warn', '처리 중'],
  FAILED: ['bad', '지급 실패'],
  COMPLETED: ['ok', '지급 완료'],
  CANCELED: ['mute', '취소'],
}

export function EarningStatusPill({ status }: { status: EarningStatus }) {
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
