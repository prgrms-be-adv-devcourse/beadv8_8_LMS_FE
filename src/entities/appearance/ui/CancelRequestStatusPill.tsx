import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { AppearanceCancelRequestStatus } from '../types'

const LABEL: Record<AppearanceCancelRequestStatus, StatusLabel> = {
  REQUESTED: ['warn', '처리 중'],
  ACCEPTED: ['ok', '수락 · 합의 취소'],
  REJECTED: ['mute', '거절'],
  AUTO_REJECTED: ['mute', '응답 없어 자동 거절'],
  CLOSED_BY_HOST_CANCEL: ['mute', '호스트 취소로 종료'],
}

/** 출연 취소 요청 한 건의 상태 */
export function CancelRequestStatusPill({
  status,
}: {
  status: AppearanceCancelRequestStatus
}) {
  const [tone, label] = statusOf(LABEL, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
