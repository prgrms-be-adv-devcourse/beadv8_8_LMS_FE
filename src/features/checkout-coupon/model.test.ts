import { describe, expect, it } from 'vitest'
import { couponQuote, quoteCoupon } from '@/test/couponMock'
import {
  orderCouponsOf,
  quoteView,
  selectionsOf,
  UNNAMED_COUPON,
} from './model'

const lines = [
  { lectureId: 7, title: '첫 방송 세팅', priceHp: 30000 },
  { lectureId: 8, title: '드럼 입문', priceHp: 20000 },
]

const names: Record<number, string> = { 11: '판매자 10%', 21: '플랫폼 2천' }
const nameOf = (id: number) => names[id]

describe('미리보기 → 화면 모델', () => {
  it('강의별 가격·적용 쿠폰(적용 순서)·할인 뒤 금액과 합계를 응답 그대로 옮긴다', () => {
    const quote = couponQuote(
      [
        {
          lectureId: 7,
          price: 30000,
          coupons: [
            // 응답 순서와 관계없이 적용 순서(판매자 먼저)로 보인다
            quoteCoupon({
              memberCouponId: 21,
              couponType: 'PLATFORM',
              discount: 2000,
            }),
            quoteCoupon({ memberCouponId: 11, discount: 3000 }),
          ],
        },
        { lectureId: 8, price: 20000 },
      ],
      { recommended: true, optimal: true },
    )
    const view = quoteView(quote, lines, nameOf)
    expect(view.rows).toEqual([
      {
        lectureId: 7,
        title: '첫 방송 세팅',
        price: 30000,
        discount: 5000,
        buyerAmount: 25000,
        coupons: [
          {
            memberCouponId: 11,
            couponType: 'SELLER',
            name: '판매자 10%',
            discount: 3000,
          },
          {
            memberCouponId: 21,
            couponType: 'PLATFORM',
            name: '플랫폼 2천',
            discount: 2000,
          },
        ],
      },
      {
        lectureId: 8,
        title: '드럼 입문',
        price: 20000,
        discount: 0,
        buyerAmount: 20000,
        coupons: [],
      },
    ])
    expect(view).toMatchObject({
      totalPrice: 50000,
      totalDiscount: 5000,
      totalBuyerAmount: 45000,
      applied: true,
      optimal: true,
    })
  })

  it('최대 할인은 추천이고 optimal일 때만이다', () => {
    const one = [{ lectureId: 7, price: 30000 }]
    expect(
      quoteView(couponQuote(one, { recommended: true }), lines, nameOf).optimal,
    ).toBe(false)
    // 직접 고른 결과는 optimal이 와도 최대 할인이라고 하지 않는다
    expect(
      quoteView(couponQuote(one, { optimal: true }), lines, nameOf).optimal,
    ).toBe(false)
  })

  it('이름을 못 찾은 쿠폰은 기본 이름, 쿠폰이 없으면 적용 안 함', () => {
    const view = quoteView(
      couponQuote([
        {
          lectureId: 7,
          price: 30000,
          coupons: [quoteCoupon({ memberCouponId: 99, discount: 1 })],
        },
      ]),
      lines,
      nameOf,
    )
    expect(view.rows[0].coupons[0].name).toBe(UNNAMED_COUPON)
    expect(
      quoteView(couponQuote([{ lectureId: 7, price: 30000 }]), lines, nameOf)
        .applied,
    ).toBe(false)
  })
})

describe('주문 본문의 쿠폰', () => {
  it('미리보기 응답의 쿠폰 매핑과 결제액으로 만든다', () => {
    const quote = couponQuote([
      {
        lectureId: 7,
        price: 30000,
        coupons: [quoteCoupon({ memberCouponId: 11, discount: 3000 })],
      },
      {
        lectureId: 8,
        price: 20000,
        coupons: [quoteCoupon({ memberCouponId: 12, discount: 2000 })],
      },
    ])
    expect(selectionsOf(quote)).toEqual([
      { memberCouponId: 11, lectureId: 7 },
      { memberCouponId: 12, lectureId: 8 },
    ])
    expect(orderCouponsOf(quote)).toEqual({
      coupons: [
        { memberCouponId: 11, lectureId: 7 },
        { memberCouponId: 12, lectureId: 8 },
      ],
      expectedBuyerAmountHp: 45000,
    })
  })

  it('쿠폰이 없거나 미리보기가 없으면 null(쿠폰 없는 주문)', () => {
    expect(
      orderCouponsOf(couponQuote([{ lectureId: 7, price: 30000 }])),
    ).toBeNull()
    expect(orderCouponsOf(undefined)).toBeNull()
  })
})
