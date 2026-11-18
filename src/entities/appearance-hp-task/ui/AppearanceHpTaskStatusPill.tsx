import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { AppearanceHpTaskStatus } from '../types'
import styles from './StatusPill.module.css'

const LABEL: Record<AppearanceHpTaskStatus, StatusLabel> = {
  DEAD: ['bad', '멈춤'],
  PENDING: ['warn', '대기'],
  DONE: ['ok', '완료'],
}

export function AppearanceHpTaskStatusPill({
  status,
}: {
  status: AppearanceHpTaskStatus
}) {
  const [tone, label] = statusOf(LABEL, status)
  return (
    <span className={`pill ${tone}`}>
      <span className={styles.glyph} data-tone={tone} aria-hidden="true" />
      {label}
    </span>
  )
}
