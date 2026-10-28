/**
 * 수익 HP 환전 규칙. 검사는 BE(EXCHANGE_AMOUNT_INVALID·INSUFFICIENT_BALANCE·INVALID_REQUEST)와 같고, 최종 판단은 BE가 한다.
 * 수수료·예상 수령액은 제출 전 미리 보기에만 계산하고, 신청 뒤에는 서버가 확정한 값을 쓴다.
 */
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import type { ExchangeStatus } from './types'

export const EXCHANGE_UNIT = 1_000
/** 입력은 9자리까지만 받는다(숫자 넘침 방지). */
export const EXCHANGE_INPUT_MAX_DIGITS = 9
export const ACCOUNT_NUMBER_MAX_DIGITS = 20
export const HOLDER_NAME_MAX = 50

export function exchangeAmountError(
  amount: number,
  revenueBalance: number,
): string | null {
  if (amount <= 0) return '환전할 HP를 입력해 주세요.'
  if (amount < EXCHANGE_UNIT) return '1,000 HP 이상부터 환전할 수 있어요.'
  if (amount % EXCHANGE_UNIT !== 0) return '1,000 HP 단위로 입력해 주세요.'
  if (amount > revenueBalance)
    return `환전할 수 있는 수익 HP(${formatNumber(revenueBalance)})를 넘었어요.`
  return null
}

export type ExchangeAccountInput = {
  bankCode: string
  accountNumber: string
  holderName: string
}

/** 테스트 계좌 형식 검사. 실제 계좌 존재·예금주 일치는 확인하지 않는다(BE도 하지 않는다). */
export function exchangeAccountErrors({
  bankCode,
  accountNumber,
  holderName,
}: ExchangeAccountInput): Partial<Record<keyof ExchangeAccountInput, string>> {
  const errors: Partial<Record<keyof ExchangeAccountInput, string>> = {}
  if (!/^\d{3}$/.test(bankCode))
    errors.bankCode = '은행 코드는 숫자 3자리로 입력해 주세요.'
  if (!/^\d{8,20}$/.test(accountNumber))
    errors.accountNumber = '계좌번호는 숫자 8~20자리로 입력해 주세요.'
  const holder = holderName.trim()
  if (holder.length === 0) errors.holderName = '예금주를 입력해 주세요.'
  else if (holder.length > HOLDER_NAME_MAX)
    errors.holderName = '예금주는 50자까지 입력할 수 있어요.'
  return errors
}

/** 제출 전 미리 보기용 수수료: 신청 금액 × 10%, 원 미만 버림 (BE Exchange.feeOf와 같은 규칙) */
export function estimateExchangeFee(amount: number): number {
  return Math.floor(amount / 10)
}

/** 신청 화면의 처음 금액: 수익 HP를 1,000 단위로 내린 값 */
export function defaultExchangeAmount(revenueBalance: number): number {
  return Math.floor(revenueBalance / EXCHANGE_UNIT) * EXCHANGE_UNIT
}

/** 최소 금액(1,000 HP)보다 적으면 환전을 신청할 수 없다. */
export function canExchange(revenueBalance: number): boolean {
  return revenueBalance >= EXCHANGE_UNIT
}

/** 회원이 취소할 수 있는 상태(관리자 승인 전) */
export function isExchangeCancelable(status: ExchangeStatus): boolean {
  return status === 'REQUESTED'
}

/**
 * 잠정 정산 예정일(KST 날짜, 예: 2026-10-12)을 10/12(월)로 쓴다.
 * 시각 없이 날짜만 오므로 KST 자정으로 읽는다.
 */
export function formatSettlementDate(date: string): string {
  return formatDate(`${date}T00:00:00+09:00`)
}

/** 정산 예정일을 보여 주는 곳마다 붙이는 안내(BE settlementRoundDate는 확정 송금일이 아니다) */
export const SETTLEMENT_NOTE =
  '정산 예정일은 주말만 반영한 잠정 날짜예요. 공휴일·승인 여부에 따라 실제 송금일은 달라질 수 있어요.'
