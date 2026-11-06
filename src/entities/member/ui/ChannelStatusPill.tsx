import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { ChannelVerificationStatus } from '../types'

const LABEL: Record<ChannelVerificationStatus, StatusLabel> = {
  REGISTERED: ['mute', '등록됨 · 승인 요청 전'],
  PENDING: ['warn', '심사 중'],
  APPROVED: ['ok', '승인'],
  REJECTED: ['bad', '반려'],
}

export function ChannelStatusPill({
  status,
}: {
  status: ChannelVerificationStatus
}) {
  const [tone, label] = statusOf(LABEL, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
