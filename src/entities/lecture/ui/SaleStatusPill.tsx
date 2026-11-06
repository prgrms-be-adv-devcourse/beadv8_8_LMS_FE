import { formatDate } from '@/shared/lib/date'
import {
  statusOf,
  unknownStatus,
  type StatusLabel,
} from '@/shared/lib/statusLabel'
import { saleStateOf, type SaleState } from '../sale'
import type { Sale } from '../types'

const LABEL: Record<SaleState, StatusLabel> = {
  OBJECTION: ['warn', '이의 제기 중'],
  SCHEDULED: ['warn', '지급 예정'],
  CANCELING: ['mute', '구매 취소 · 반환 중'],
  CANCELED: ['mute', '구매 취소 · 반환'],
  RETURNING: ['info', '이의 제기 인정 · 반환 중'],
  RETURNED: ['info', '이의 제기 인정 · 반환'],
  PAYING_OUT: ['warn', '지급 처리 중'],
  PAID_OUT: ['ok', '지급 완료'],
}

export function SaleStatusPill({ sale }: { sale: Sale }) {
  const state = saleStateOf(sale)
  const [tone, label] = state
    ? statusOf(LABEL, state)
    : unknownStatus(sale.status)
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span className={`pill ${tone}`}>{label}</span>
      {state === 'PAID_OUT' && sale.paidOutAt && (
        <span className="fine">{formatDate(sale.paidOutAt)} 지급</span>
      )}
    </span>
  )
}
