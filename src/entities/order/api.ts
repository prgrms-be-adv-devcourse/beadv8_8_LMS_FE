import { queryOptions } from '@tanstack/react-query'
import { allPages } from '@/shared/api/allPages'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { CouponSelection } from '@/entities/coupon/types'
import { orderPollInterval } from './processing'
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
    // 결제·구매 취소·반환 결과를 기다리는 주문은 끝날 때까지 다시 부른다.
    refetchInterval: (query) => orderPollInterval(query.state.data),
  })

/** 시청·리뷰 권한 판단에 사용하므로 모든 페이지를 조회한다. */
export const purchasedQuery = queryOptions({
  queryKey: orderKeys.purchased(),
  queryFn: () => allPages<PurchasedLecture>('/lectures/purchased'),
})

/**
 * 장바구니 주문은 담은 강의 ID들, 바로 구매는 강의 ID 1개.
 * 모든 HP 보류가 성공하면 201 + PAID, 결과를 아직 모르면 202 + 결제 처리 중 주문이다(다시 주문하지 않고 주문 상세로 결과를 본다).
 * 잔액이 부족하면 409 INSUFFICIENT_BALANCE이고 주문은 결제 실패로 남는다.
 *
 * 쿠폰을 쓰면 coupons(쿠폰을 쓸 강의는 lectureIds 안)와 미리보기의 결제액 합(expectedBuyerAmountHp)을 함께 보낸다.
 * 쿠폰이 없으면 둘 다 보내지 않는다(기존 주문과 같다). 쿠폰 오류는 409 ORDER_QUOTE_CHANGED·COUPON_CALCULATION_REJECTED·
 * COUPON_RESERVATION_REJECTED(속성 couponCode·memberCouponId)·COUPON_PLATFORM_FUNDING_UNAVAILABLE, 503 COUPON_UNAVAILABLE
 */
export function createOrder(
  lectureIds: number[],
  coupons?: CouponSelection[],
  expectedBuyerAmountHp?: number,
) {
  const withCoupons = coupons !== undefined && coupons.length > 0
  return api<Order>('/lectures/orders', {
    method: 'POST',
    body: withCoupons
      ? { lectureIds, coupons, expectedBuyerAmountHp }
      : { lectureIds },
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

/**
 * 구매 취소. PURCHASED이고 autoConfirmAt 전, 이의 제기 없음.
 * HP 반환이 끝나면 200 + CANCELED, 아직이면 202 + CANCEL_PENDING이다(다시 보내지 않는다).
 */
export function cancelOrderItem(ref: ItemRef) {
  return api<OrderItem>(itemPath(ref, 'cancel'), { method: 'POST' })
}
