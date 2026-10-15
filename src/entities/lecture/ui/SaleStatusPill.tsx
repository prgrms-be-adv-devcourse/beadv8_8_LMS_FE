import { formatDate } from '@/shared/lib/date'
import { saleStateOf, type SaleState } from '../sale'
import type { Sale } from '../types'

const LABEL: Record<SaleState, [tone: string, label: string]> = {
  OBJECTION: ['warn', '이의 제기 중'],
  CANCELED: ['mute', '구매 취소 · 반환'],
  RETURNED: ['info', '이의 제기 인정 · 반환'],
  PAID_OUT: ['ok', '지급 완료'],
  SCHEDULED: ['warn', '지급 예정'],
}

export function SaleStatusPill({ sale }: { sale: Sale }) {
  const state = saleStateOf(sale)
  const [tone, label] = LABEL[state]
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span className={`pill ${tone}`}>{label}</span>
      {state === 'PAID_OUT' && sale.paidOutAt && (
        <span className="fine">{formatDate(sale.paidOutAt)} 지급</span>
      )}
    </span>
  )
}
