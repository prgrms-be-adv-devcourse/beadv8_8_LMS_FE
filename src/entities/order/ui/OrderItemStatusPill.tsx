import type { OrderItemStatus } from '../types'

const LABEL: Record<OrderItemStatus, [tone: string, label: string]> = {
  PURCHASED: ['warn', '구매 확정 전'],
  CONFIRMED: ['ok', '구매 확정'],
  PAID_OUT: ['ok', '구매 확정'],
  CANCELED: ['mute', '구매 취소 · HP 반환'],
  RETURNED: ['info', '이의 제기 인정 · 반환'],
}

export function OrderItemStatusPill({ status }: { status: OrderItemStatus }) {
  const [tone, label] = LABEL[status]
  return <span className={`pill ${tone}`}>{label}</span>
}
