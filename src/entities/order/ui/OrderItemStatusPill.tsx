import { statusOf, type StatusLabel } from '@/shared/lib/statusLabel'
import type { OrderItemStatus } from '../types'

/** 구매자가 보는 항목 상태. 지급 처리 중·지급은 구매자에게 구매 확정과 같다(BE lecture module.md 상태별 허용 범위) */
const LABEL: Record<OrderItemStatus, StatusLabel> = {
  HOLD_PENDING: ['warn', '결제 처리 중'],
  HOLD_COMPENSATING: ['warn', '결제 취소 처리 중'],
  HOLD_FAILED: ['bad', '결제 실패'],
  PURCHASED: ['warn', '구매 확정 전'],
  CONFIRMED: ['ok', '구매 확정'],
  PAYOUT_PENDING: ['ok', '구매 확정'],
  PAID_OUT: ['ok', '구매 확정'],
  CANCEL_PENDING: ['warn', '구매 취소 처리 중'],
  CANCELED: ['mute', '구매 취소 · HP 반환'],
  RETURN_PENDING: ['warn', '반환 처리 중'],
  RETURNED: ['info', '이의 제기 인정 · 반환'],
}

export function OrderItemStatusPill({ status }: { status: OrderItemStatus }) {
  const [tone, label] = statusOf(LABEL, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
