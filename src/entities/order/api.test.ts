import { describe, expect, it } from 'vitest'
import { quoteCoupons } from '@/entities/coupon/api'
import { couponQuote, mockCoupons } from '@/test/couponMock'
import { mockCreateOrder } from '@/test/lectureOrders'
import { createOrder } from './api'
import type { Order } from './types'

const paid: Order = {
  orderId: 900,
  totalAmountHp: 30000,
  discountHp: 3000,
  buyerAmountHp: 27000,
  status: 'PAID',
  progress: 'IN_PROGRESS',
  processingStatus: null,
  orderedAt: '2026-11-10T10:00:00',
  paidAt: '2026-11-10T10:00:00',
  canceledAt: null,
  items: [],
}

describe('주문 생성 본문', () => {
  it('쿠폰이 없으면 coupons·expectedBuyerAmountHp를 보내지 않는다(기존 주문과 같다)', async () => {
    const created = mockCreateOrder(paid)
    await createOrder([7])
    await createOrder([7], [], 30000)
    expect(created.bodies).toEqual([{ lectureIds: [7] }, { lectureIds: [7] }])
  })

  it('쿠폰을 쓰면 매핑과 미리보기 결제액을 함께 보낸다', async () => {
    const created = mockCreateOrder(paid)
    await createOrder([7, 8], [{ memberCouponId: 1, lectureId: 7 }], 27000)
    expect(created.bodies).toEqual([
      {
        lectureIds: [7, 8],
        coupons: [{ memberCouponId: 1, lectureId: 7 }],
        expectedBuyerAmountHp: 27000,
      },
    ])
  })
})

describe('할인 미리보기 요청', () => {
  it('추천은 selections를 null로, 쿠폰 없이는 []로 보낸다', async () => {
    const state = mockCoupons({
      quotes: [couponQuote([{ lectureId: 7, price: 30000 }])],
    })
    const result = await quoteCoupons([7], null)
    await quoteCoupons([7], [])
    expect(state.quoteRequests).toEqual([
      { lectureIds: [7], selections: null },
      { lectureIds: [7], selections: [] },
    ])
    expect(result).toMatchObject({ totalDiscount: 0, totalBuyerAmount: 30000 })
  })
})
