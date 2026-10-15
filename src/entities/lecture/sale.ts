import type { Sale } from './types'

export type SaleState =
  'OBJECTION' | 'CANCELED' | 'RETURNED' | 'PAID_OUT' | 'SCHEDULED'

type SaleStateInput = Pick<Sale, 'status' | 'objectionStatus'>

/** 판매 한 건의 지급 상태. 이의 제기 중이면 취소할 수 없으므로 먼저 본다. */
export function saleStateOf(sale: SaleStateInput): SaleState {
  if (sale.objectionStatus === 'FILED') return 'OBJECTION'
  if (sale.status === 'CANCELED' || sale.status === 'RETURNED')
    return sale.status
  if (sale.status === 'PAID_OUT') return 'PAID_OUT'
  return 'SCHEDULED'
}

/** 취소·반환한 판매는 지급하지 않는다. */
export function isRefunded(sale: SaleStateInput) {
  const state = saleStateOf(sale)
  return state === 'CANCELED' || state === 'RETURNED'
}
