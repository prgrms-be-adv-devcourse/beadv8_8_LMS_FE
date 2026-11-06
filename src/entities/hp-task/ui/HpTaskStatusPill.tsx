import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { HpTaskOutcome, HpTaskStatus } from '../types'

const LABEL: Record<HpTaskStatus, StatusLabel> = {
  DEAD: ['bad', '멈춤'],
  PENDING: ['warn', '대기'],
  PROCESSING: ['info', '처리 중'],
  COMPLETED: ['ok', '완료'],
}

/** 끝난 작업은 성공이 아니면 결과(거절·건너뜀)까지 보여 준다 */
const OUTCOME: Partial<Record<HpTaskOutcome, string>> = {
  REJECTED: '완료 · 거절',
  SKIPPED: '완료 · 건너뜀',
}

export function HpTaskStatusPill({
  status,
  outcome,
}: {
  status: HpTaskStatus
  outcome: HpTaskOutcome | null
}) {
  const [tone, label] = statusOf(LABEL, status)
  const finished = status === 'COMPLETED' && outcome && OUTCOME[outcome]
  return (
    <span className={`pill ${finished ? 'mute' : tone}`}>
      {status === 'PROCESSING' && (
        <span className="spinner xs" aria-hidden="true" />
      )}
      {finished || label}
    </span>
  )
}
