import type { AppearanceStatus } from '../types'

const LABEL: Record<AppearanceStatus, [tone: string, label: string]> = {
  ESTABLISHED: ['info', '출연 성립'],
  CANCEL_REQUESTED: ['warn', '취소 요청 처리 중'],
  CONFIRMED: ['ok', '출연 확인'],
  ABSENT: ['mute', '불참 · HP 반환'],
  CANCELED_BY_HOST: ['mute', '호스트 취소 · 위약금 지급'],
  CANCELED_BY_AGREEMENT: ['mute', '합의 취소 · HP 반환'],
}

export function AppearanceStatusPill({ status }: { status: AppearanceStatus }) {
  const [tone, label] = LABEL[status]
  return <span className={`pill ${tone}`}>{label}</span>
}
