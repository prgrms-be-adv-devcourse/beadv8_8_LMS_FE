import type { ExchangeStatus } from '../types'

const LABEL: Record<ExchangeStatus, [tone: string, label: string]> = {
  REQUESTED: ['warn', '승인 대기'],
  PROCESSING: ['warn', '송금 중'],
  COMPLETED: ['ok', '송금 완료'],
  FAILED: ['bad', '송금 실패'],
  UNKNOWN: ['warn', '확인 중'],
  CANCELED: ['mute', '신청 취소'],
}

export function ExchangeStatusPill({ status }: { status: ExchangeStatus }) {
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
