/**
 * 관리자 환전 승인·거절 규칙. 검사는 BE(EXCHANGE_ALREADY_REVIEWED·EXCHANGE_APPLICANT_*·EXCHANGE_REJECTION_REASON_INVALID)와 같고,
 * 최종 판단은 BE가 한다.
 */
import { VIEWER_LABEL } from '@/shared/auth/role'
import type { AdminExchange, ExchangeApplicant, ExchangeStatus } from './types'

export const REJECTION_REASON_MAX = 500

/** 관리자 목록의 상태 필터. 송금 단계(PROCESSING 이후)는 BE 후속 기능이라 두지 않는다. */
export const ADMIN_EXCHANGE_FILTERS = [
  {
    status: 'REQUESTED',
    label: '승인 대기',
    empty: '승인 대기 신청이 없어요',
  },
  { status: 'APPROVED', label: '승인', empty: '승인한 신청이 없어요' },
  { status: 'REJECTED', label: '거절', empty: '거절한 신청이 없어요' },
  {
    status: 'CANCELED',
    label: '회원 취소',
    empty: '회원이 취소한 신청이 없어요',
  },
] as const satisfies readonly {
  status: ExchangeStatus
  label: string
  empty: string
}[]

export type AdminExchangeFilter =
  (typeof ADMIN_EXCHANGE_FILTERS)[number]['status']

/** 승인 대기(REQUESTED)인 신청만 승인·거절할 수 있다. */
export function isExchangeReviewable(status: ExchangeStatus): boolean {
  return status === 'REQUESTED'
}

/** 신청자 회원 상태 표시. 상세 화면과 승인 불가 이유가 함께 쓴다 */
export const APPLICANT_STATUS_LABEL: Record<
  ExchangeApplicant['status'],
  string
> = {
  ACTIVE: '정상',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
}

/** 승인할 수 없으면 그 이유(거절은 할 수 있다). 신청자의 현재 회원 정보(복제본)로 정한다. */
export function approveBlockReason({
  applicant,
}: Pick<AdminExchange, 'applicant'>): string | null {
  if (!applicant)
    return '신청자 회원 정보가 아직 반영되지 않아 승인할 수 없어요.'
  if (applicant.approvable) return null
  const why =
    applicant.status !== 'ACTIVE'
      ? APPLICANT_STATUS_LABEL[applicant.status]
      : VIEWER_LABEL[applicant.role]
  return `정상 상태의 인플루언서가 아니라 승인할 수 없어요(${why}).`
}

/** 앞뒤 공백을 뺀 1~500자 */
export function rejectionReasonError(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed.length === 0) return '거절 사유를 입력해 주세요.'
  if (trimmed.length > REJECTION_REASON_MAX)
    return `거절 사유는 ${REJECTION_REASON_MAX}자까지 입력할 수 있어요.`
  return null
}

/** 신청자 표시: 닉네임 · 회원 #ID · 역할(복제본이 없으면 동기화 전) */
export function applicantLabel({
  userId,
  applicant,
}: Pick<AdminExchange, 'userId' | 'applicant'>): string {
  if (!applicant) return `회원 #${userId} · 정보 동기화 전`
  return `${applicant.nickname} · 회원 #${userId} · ${VIEWER_LABEL[applicant.role]}`
}
