/** HP 충전 규칙과 결제창 리다이렉트 주소. 금액 검사는 BE(CHARGE_AMOUNT_INVALID)와 같고, 최종 판단은 BE가 한다. */

export const CHARGE_UNIT = 1_000
export const CHARGE_PRESETS = [10_000, 30_000, 50_000, 100_000] as const
export const DEFAULT_CHARGE_AMOUNT = 30_000
/** 입력은 9자리(999,999,000)까지만 받는다. 상한은 BE에 없어 숫자 넘침만 막는다. */
export const CHARGE_INPUT_MAX_DIGITS = 9

/** 승인 결과를 확인 중(PROCESSING)일 때 주문 상태를 다시 보는 간격·횟수 (2초 × 15번 = 30초) */
export const CHARGE_POLL_INTERVAL_MS = 2_000
export const CHARGE_POLL_MAX = 15

export const CHARGE_RESULT_PATH = '/wallet/charge/result'

export function chargeAmountError(amount: number): string | null {
  if (amount <= 0) return '충전할 금액을 입력해 주세요.'
  if (amount < CHARGE_UNIT) return '최소 1,000원부터 충전할 수 있어요.'
  if (amount % CHARGE_UNIT !== 0) return '1,000원 단위로 입력해 주세요.'
  return null
}

/** 모자란 HP를 채우는 충전 금액(1,000 단위 올림) */
export function chargeAmountForShort(short: number): number {
  return Math.max(CHARGE_UNIT, Math.ceil(short / CHARGE_UNIT) * CHARGE_UNIT)
}

/** 지갑에서 충전 모달을 그 금액으로 연다. 다른 화면의 "HP 충전하러 가기"가 쓴다. */
export function chargeHref(short: number): string {
  return `/wallet?charge=${chargeAmountForShort(short)}`
}

/** /wallet?charge=N의 N. 올바른 충전 금액이 아니면 null */
export function parseChargeAmountParam(value: string | null): number | null {
  const amount = parseAmount(value)
  return amount !== null && chargeAmountError(amount) === null ? amount : null
}

/**
 * 결제창이 돌아올 주소. 토스는 successUrl에 paymentKey·orderId·amount를,
 * failUrl에 code·message·orderId를 붙인다. 실패 화면에도 금액을 보여 주려고 failUrl에 amount를 넣어 둔다.
 */
export function chargeReturnUrls(origin: string, amount: number) {
  return {
    successUrl: `${origin}${CHARGE_RESULT_PATH}`,
    failUrl: `${origin}${CHARGE_RESULT_PATH}?amount=${amount}`,
  }
}

export type ChargeReturn =
  | { kind: 'success'; paymentKey: string; orderId: string; amount: number }
  | {
      kind: 'fail'
      code: string
      message: string | null
      orderId: string | null
      amount: number | null
    }

/** 결제 결과 화면의 쿼리. 승인에 필요한 값이 없으면 null(지갑으로 보낸다). */
export function parseChargeReturn(
  params: URLSearchParams,
): ChargeReturn | null {
  const orderId = params.get('orderId') || null
  const amount = parseAmount(params.get('amount'))
  const paymentKey = params.get('paymentKey')
  if (paymentKey) {
    return orderId && amount !== null
      ? { kind: 'success', paymentKey, orderId, amount }
      : null
  }
  const code = params.get('code')
  if (code) {
    return {
      kind: 'fail',
      code,
      message: params.get('message') || null,
      orderId,
      amount,
    }
  }
  return null
}

function parseAmount(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const amount = Number(value)
  return amount > 0 ? amount : null
}
