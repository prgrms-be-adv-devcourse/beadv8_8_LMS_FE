import type { Sale } from './types'

export type SaleState =
  | 'OBJECTION'
  | 'SCHEDULED'
  | 'CANCELING'
  | 'CANCELED'
  | 'RETURNING'
  | 'RETURNED'
  | 'PAYING_OUT'
  | 'PAID_OUT'

type SaleStateInput = Pick<Sale, 'status' | 'objectionStatus'>

/**
 * 판매 한 건의 지급 상태. 이의 제기 중이면 취소할 수 없으므로 먼저 본다.
 * 모르는 상태는 지급 예정으로 몰지 않고 undefined다. 결제 단계(HOLD_*)는 아직 팔린 것이 아니라 BE가 판매 내역에서 뺀다.
 */
export function saleStateOf(sale: SaleStateInput): SaleState | undefined {
  if (sale.objectionStatus === 'FILED') return 'OBJECTION'
  switch (sale.status) {
    case 'PURCHASED':
    case 'CONFIRMED':
      return 'SCHEDULED'
    case 'CANCEL_PENDING':
      return 'CANCELING'
    case 'CANCELED':
      return 'CANCELED'
    case 'RETURN_PENDING':
      return 'RETURNING'
    case 'RETURNED':
      return 'RETURNED'
    case 'PAYOUT_PENDING':
      return 'PAYING_OUT'
    case 'PAID_OUT':
      return 'PAID_OUT'
    default:
      return undefined
  }
}

const REFUNDED: ReadonlySet<SaleState | undefined> = new Set([
  'CANCELING',
  'CANCELED',
  'RETURNING',
  'RETURNED',
])

/** 구매 취소·반환한(돌려주는 중인 것 포함) 판매는 지급하지 않는다. */
export function isRefunded(sale: SaleStateInput) {
  return REFUNDED.has(saleStateOf(sale))
}
