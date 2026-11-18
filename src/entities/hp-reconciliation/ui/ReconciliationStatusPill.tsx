import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { ReconciliationStatus } from '../types'
import styles from './StatusPill.module.css'

const LABEL: Record<ReconciliationStatus, StatusLabel> = {
  RUNNING: ['info', '실행 중'],
  COMPLETED: ['ok', '완료'],
  INCOMPLETE: ['warn', '중단'],
}

/** 실행 상태. 어긋난 건이 있는지는 따로 보인다 */
export function ReconciliationStatusPill({
  status,
}: {
  status: ReconciliationStatus
}) {
  const [tone, label] = statusOf(LABEL, status)
  return (
    <span className={`pill ${tone}`}>
      {status === 'RUNNING' ? (
        <span className="spinner xs" aria-hidden="true" />
      ) : (
        <span className={styles.glyph} data-tone={tone} aria-hidden="true" />
      )}
      {label}
    </span>
  )
}
