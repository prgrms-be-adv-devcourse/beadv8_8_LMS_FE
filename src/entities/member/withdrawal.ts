import { isApiError } from '@/shared/api/ApiError'
import { formatDate, formatDateTime, parseServerDate } from '@/shared/lib/date'

/**
 * 탈퇴가 막힌 이유 한 줄 (BE WithdrawalBlockReasonDto, docs/api/internal-withdrawals.md 2장).
 * message는 무엇을 정리하면 되는지 BE가 적은 문장이라 그대로 보여 준다.
 */
export type WithdrawalBlockReason = {
  /** 모듈 접두어가 붙은 이유 코드 (예: BILLING_CHARGE_BALANCE_REMAINING) */
  code: string
  message: string
  /** 기다리면 풀리는 경우 그 날짜(LocalDate, KST). 없으면 빠지거나 null */
  availableAt?: string | null
}

/** 409 WITHDRAWAL_BLOCKED의 reasons. 다른 오류면 null */
export function withdrawalBlockReasons(
  error: unknown,
): WithdrawalBlockReason[] | null {
  if (!isApiError(error, 'WITHDRAWAL_BLOCKED')) return null
  const reasons = error.body?.reasons
  return Array.isArray(reasons) ? reasons : []
}

/** 날짜(LocalDate)를 12/7(월)로. formatDate는 시각까지 있는 값을 받는다 */
export function formatAvailableAt(availableAt: string): string {
  return formatDate(`${availableAt}T00:00:00`)
}

/** 이유 코드 접두어별로 정리하러 갈 화면. 순서대로 먼저 맞는 것을 쓴다 */
const SHORTCUTS: { prefix: string; to: string; label: string }[] = [
  { prefix: 'BILLING_', to: '/wallet', label: '지갑' },
  { prefix: 'APPEARANCE_', to: '/appearances', label: '내 출연' },
  { prefix: 'LECTURE_ORDER_', to: '/library/orders', label: '주문 내역' },
  { prefix: 'LECTURE_OBJECTION_', to: '/library/orders', label: '주문 내역' },
  { prefix: 'LECTURE_SALE_', to: '/studio', label: '강의 판매' },
  { prefix: 'LECTURE_ON_SALE', to: '/studio', label: '강의 판매' },
]

/** 이 이유를 정리하러 갈 화면. 모르는 코드면 null(문장만 보인다) */
export function withdrawalShortcut(
  code: string,
): { to: string; label: string } | null {
  const found = SHORTCUTS.find((s) => code.startsWith(s.prefix))
  return found ? { to: found.to, label: found.label } : null
}

/** 복구 기한(LocalDateTime, KST)을 12/5(토) 10:00으로. 없거나 읽을 수 없으면 null */
export function formatRestorableUntil(
  restorableUntil: string | null | undefined,
): string | null {
  if (!restorableUntil) return null
  if (Number.isNaN(parseServerDate(restorableUntil).getTime())) return null
  return formatDateTime(restorableUntil)
}
