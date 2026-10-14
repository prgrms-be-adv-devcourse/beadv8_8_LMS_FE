import type { ChannelVerificationStatus } from '../types'

const LABEL: Record<ChannelVerificationStatus, [tone: string, label: string]> =
  {
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
  const [tone, label] = LABEL[status]
  return <span className={`pill ${tone}`}>{label}</span>
}
