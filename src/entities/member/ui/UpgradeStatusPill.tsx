import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { UpgradeRequestStatus } from '../types'

const LABEL: Record<UpgradeRequestStatus, StatusLabel> = {
  PENDING: ['warn', '심사 중'],
  APPROVED: ['ok', '승인'],
  REJECTED: ['bad', '반려'],
}

export function UpgradeStatusPill({
  status,
}: {
  status: UpgradeRequestStatus
}) {
  const [tone, label] = statusOf(LABEL, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
