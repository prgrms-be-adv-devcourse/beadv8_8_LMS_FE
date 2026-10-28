import type { AppearanceStatus, RequestSide } from '../types'

const LABEL: Record<AppearanceStatus, [tone: string, label: string]> = {
  ESTABLISHED: ['info', '출연 성립'],
  CANCEL_REQUESTED: ['warn', '취소 요청 처리 중'],
  CONFIRMED: ['ok', '출연 확인'],
  ABSENT: ['mute', '불참 · HP 반환'],
  CANCELED_BY_HOST: ['mute', '호스트 취소 · 위약금 지급'],
  CANCELED_BY_AGREEMENT: ['mute', '합의 취소 · HP 반환'],
}

const AWAITING: Record<RequestSide, string> = {
  host: '출연 확인 필요',
  guest: '확인 대기',
}

/** awaiting: 방송이 끝나 호스트의 출연 확인을 기다리는 중이면 보는 역할 */
export function AppearanceStatusPill({
  status,
  awaiting,
}: {
  status: AppearanceStatus
  awaiting?: RequestSide
}) {
  if (awaiting) return <span className="pill warn">{AWAITING[awaiting]}</span>
  const [tone, label] = LABEL[status]
  return <span className={`pill ${tone}`}>{label}</span>
}
