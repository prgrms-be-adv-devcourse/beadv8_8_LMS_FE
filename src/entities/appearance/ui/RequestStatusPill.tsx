import type { AppearanceRequestStatus, RequestSide } from '../types'

/** 상태 표시. 응답 대기는 내가 호스트면 "수락 대기", 게스트면 "응답 필요" */
export function RequestStatusPill({
  status,
  side,
}: {
  status: AppearanceRequestStatus
  side: RequestSide
}) {
  const [tone, label] = labelOf(status, side)
  return <span className={`pill ${tone}`}>{label}</span>
}

function labelOf(
  status: AppearanceRequestStatus,
  side: RequestSide,
): [string, string] {
  switch (status) {
    case 'REQUESTED':
      return side === 'host' ? ['warn', '수락 대기'] : ['signal', '응답 필요']
    case 'ACCEPTED':
      return ['info', '출연 성립']
    case 'REJECTED':
      return ['mute', '거절됨 · HP 반환']
    case 'EXPIRED':
      return ['mute', '수락 기한 만료 · HP 반환']
    case 'CANCELED':
      return ['mute', '요청 취소 · HP 반환']
    case 'HOLD_PENDING':
      return ['warn', 'HP 보류 처리 중']
    case 'HOLD_FAILED':
      return ['bad', 'HP 보류 실패']
  }
}
