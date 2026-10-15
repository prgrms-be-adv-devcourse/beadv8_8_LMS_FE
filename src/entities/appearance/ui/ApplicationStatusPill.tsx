import type { ApplicationStatus } from '../types'

const LABEL: Record<ApplicationStatus, [string, string]> = {
  APPLIED: ['info', '대기'],
  SELECTED: ['ok', '출연 성립'],
  NOT_SELECTED: ['mute', '미선정'],
  WITHDRAWN: ['mute', '지원 취소'],
}

export function ApplicationStatusPill({
  status,
}: {
  status: ApplicationStatus
}) {
  const [tone, label] = LABEL[status]
  return <span className={`pill ${tone}`}>{label}</span>
}
