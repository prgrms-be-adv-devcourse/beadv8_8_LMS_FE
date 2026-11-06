import type { Order, OrderItem, OrderItemStatus, OrderStatus } from './types'

/** 처리 중 주문을 다시 부르는 간격(출연의 보류 확인 중과 같다). BE는 HP 작업을 1분마다 다시 시도한다 */
export const ORDER_PROCESSING_POLL_MS = 5_000

/** 결제가 끝나지 않은 주문 상태 */
const HOLD_IN_PROGRESS: ReadonlySet<OrderStatus> = new Set([
  'HOLD_PENDING',
  'HOLD_COMPENSATING',
])

/**
 * 구매자가 결과를 기다리는 항목 상태(구매 취소·반환 처리 중).
 * 지급 처리 중은 구매자에게 구매 확정과 같아서 기다리지 않는다.
 */
const SETTLING_ITEM: ReadonlySet<OrderItemStatus> = new Set([
  'CANCEL_PENDING',
  'RETURN_PENDING',
])

/**
 * 항목마다 보일 처리 상태(구매 취소·반환 처리 중). 결제 단계는 주문과 같은 값이라 주문에서 한 번만 보이고,
 * 지급 처리 중은 구매자에게 구매 확정과 같아서 보이지 않는다.
 */
export function itemProcessingStatus(item: OrderItem) {
  return SETTLING_ITEM.has(item.status) ? item.processingStatus : null
}

/**
 * 주문 상세를 다시 부를 간격. 결제가 끝나지 않았거나 구매 취소·반환 중인 항목이 있는 동안 다시 부른다.
 * 자동 처리가 멈춘 것(ACTION_REQUIRED)은 관리자 복구를 기다려야 해서 다시 부르지 않는다.
 */
export function orderPollInterval(order: Order | undefined): number | false {
  if (!order) return false
  const waiting = [
    ...(HOLD_IN_PROGRESS.has(order.status) ? [order.processingStatus] : []),
    ...order.items
      .filter((item) => SETTLING_ITEM.has(item.status))
      .map((item) => item.processingStatus),
  ]
  return waiting.some((status) => status !== 'ACTION_REQUIRED')
    ? ORDER_PROCESSING_POLL_MS
    : false
}
