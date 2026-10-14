import { queryOptions } from '@tanstack/react-query'
import { allPages } from '@/shared/api/allPages'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { Order, OrderItem, OrderSummary, PurchasedLecture } from './types'

export const orderKeys = {
  all: ['order'] as const,
  list: (page: number) => [...orderKeys.all, 'list', page] as const,
  detail: (orderId: number) => [...orderKeys.all, 'detail', orderId] as const,
  purchased: () => [...orderKeys.all, 'purchased'] as const,
}

export const ordersQuery = (page: number) =>
  queryOptions({
    queryKey: orderKeys.list(page),
    queryFn: () =>
      api<PagedModel<OrderSummary>>('/lectures/orders', {
        query: { page, size: 10 },
      }),
  })

export const orderQuery = (orderId: number) =>
  queryOptions({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => api<Order>(`/lectures/orders/${orderId}`),
  })

/** 시청·리뷰 권한 판단에 사용하므로 모든 페이지를 조회한다. */
export const purchasedQuery = queryOptions({
  queryKey: orderKeys.purchased(),
  queryFn: () => allPages<PurchasedLecture>('/lectures/purchased'),
})

/** 장바구니 주문은 담은 강의 ID들, 바로 구매는 강의 ID 1개. HP 보류까지 끝난 뒤 응답한다. */
export function createOrder(lectureIds: number[]) {
  return api<Order>('/lectures/orders', {
    method: 'POST',
    body: { lectureIds },
  })
}

type ItemRef = { orderId: number; orderItemId: number }

const itemPath = ({ orderId, orderItemId }: ItemRef, action: string) =>
  `/lectures/orders/${orderId}/items/${orderItemId}/${action}`

/** 구매 확정 (직접). PURCHASED → CONFIRMED(DIRECT) */
export function confirmOrderItem(ref: ItemRef) {
  return api<OrderItem>(itemPath(ref, 'confirm'), { method: 'POST' })
}

/** 재생 동의. 첫 재생·자료 다운로드 전에 받는다. PURCHASED → CONFIRMED(FIRST_PLAY) */
export function consentToPlay(ref: ItemRef) {
  return api<OrderItem>(itemPath(ref, 'play-consent'), { method: 'POST' })
}

/** 구매 취소. PURCHASED이고 autoConfirmAt 전, 이의 제기 없음. HP 반환까지 끝난 뒤 응답한다. */
export function cancelOrderItem(ref: ItemRef) {
  return api<OrderItem>(itemPath(ref, 'cancel'), { method: 'POST' })
}
