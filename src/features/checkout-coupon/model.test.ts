import { describe, expect, it } from 'vitest'
import { couponQuote, quoteCoupon } from '@/test/couponMock'
import {
  chooseCoupon,
  couponOrderError,
  couponRejectReason,
  hasPlatformCoupon,
  orderCouponsOf,
  PLATFORM_UNAVAILABLE,
  quoteFailure,
  quoteView,
  selectionsOf,
  UNNAMED_COUPON,
  withoutPlatform,
  type CouponInfo,
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

describe('직접 선택 규칙', () => {
  const info: Record<number, CouponInfo> = {
    11: { couponType: 'SELLER', stackable: true },
    12: { couponType: 'SELLER', stackable: true },
    13: { couponType: 'SELLER', stackable: false },
    21: { couponType: 'PLATFORM', stackable: true },
    22: { couponType: 'PLATFORM', stackable: true },
  }
  const infoOf = (id: number) => info[id]
  const order = [7, 8]
  const pick = (
    current: { memberCouponId: number; lectureId: number }[],
    lectureId: number,
    slot: 'SELLER' | 'PLATFORM',
    memberCouponId: number | null,
  ) => chooseCoupon(current, { lectureId, slot, memberCouponId }, infoOf, order)

  it('같은 칸은 교체하고, 다른 칸은 그대로 두며 판매자 → 플랫폼 순서로 둔다', () => {
    const start = [{ memberCouponId: 21, lectureId: 7 }]
    const withSeller = pick(start, 7, 'SELLER', 11)
    expect(withSeller).toEqual([
      { memberCouponId: 11, lectureId: 7 },
      { memberCouponId: 21, lectureId: 7 },
    ])
    expect(pick(withSeller, 7, 'SELLER', 12)).toEqual([
      { memberCouponId: 12, lectureId: 7 },
      { memberCouponId: 21, lectureId: 7 },
    ])
    expect(pick(withSeller, 7, 'SELLER', null)).toEqual([
      { memberCouponId: 21, lectureId: 7 },
    ])
  })

  it('한 쿠폰은 한 강의에만: 다른 강의로 옮기면 앞 강의에서 빠진다', () => {
    const start = [{ memberCouponId: 21, lectureId: 7 }]
    expect(pick(start, 8, 'PLATFORM', 21)).toEqual([
      { memberCouponId: 21, lectureId: 8 },
    ])
  })

  it('단독 사용 쿠폰은 같은 강의의 다른 칸과 함께 두지 않는다', () => {
    const both = [
      { memberCouponId: 11, lectureId: 7 },
      { memberCouponId: 21, lectureId: 7 },
    ]
    // 단독 쿠폰을 고르면 다른 칸이 빠진다
    expect(pick(both, 7, 'SELLER', 13)).toEqual([
      { memberCouponId: 13, lectureId: 7 },
    ])
    // 단독 쿠폰이 있는 강의에 다른 칸을 고르면 단독 쿠폰이 빠진다
    expect(
      pick([{ memberCouponId: 13, lectureId: 7 }], 7, 'PLATFORM', 22),
    ).toEqual([{ memberCouponId: 22, lectureId: 7 }])
    // 다른 강의의 쿠폰은 건드리지 않는다
    expect(
      pick([{ memberCouponId: 21, lectureId: 8 }], 7, 'SELLER', 13),
    ).toEqual([
      { memberCouponId: 13, lectureId: 7 },
      { memberCouponId: 21, lectureId: 8 },
    ])
  })

  it('플랫폼 쿠폰을 뺀 매핑', () => {
    const quote = couponQuote([
      {
        lectureId: 7,
        price: 30000,
        coupons: [
          quoteCoupon({ memberCouponId: 11, discount: 3000 }),
          quoteCoupon({
            memberCouponId: 21,
            couponType: 'PLATFORM',
            discount: 2000,
          }),
        ],
      },
    ])
    expect(hasPlatformCoupon(quote)).toBe(true)
    expect(withoutPlatform(quote)).toEqual([
      { memberCouponId: 11, lectureId: 7 },
    ])
  })
})

describe('쿠폰 주문 오류', () => {
  it('쿠폰 오류 코드별 사유, 모르는 코드는 기본 문구', () => {
    expect(couponRejectReason('COUPON_NOT_USABLE')).toBe(
      '이미 쓰였거나 만료된 쿠폰이에요.',
    )
    expect(couponRejectReason('COUPON_NOT_APPLICABLE')).toBe(
      '이 강의에 쓸 수 없는 쿠폰이에요.',
    )
    expect(couponRejectReason('COUPON_STACKING_VIOLATION')).toBe(
      '함께 쓸 수 없는 쿠폰이에요.',
    )
    for (const code of [
      'COUPON_GENERATION_MISMATCH',
      'COUPON_POLICY_VERSION_CHANGED',
      'COUPON_AMOUNT_MISMATCH',
      'COUPON_LECTURE_PRICE_MISMATCH',
    ])
      expect(couponRejectReason(code)).toBe(
        '쿠폰이나 강의 가격이 바뀌었어요. 다시 확인해 주세요.',
      )
    expect(couponRejectReason('BRAND_NEW')).toBe(
      '이 쿠폰을 쓸 수 없어요. 쿠폰을 다시 골라 주세요.',
    )
    expect(couponRejectReason(undefined)).toBe(
      '이 쿠폰을 쓸 수 없어요. 쿠폰을 다시 골라 주세요.',
    )
  })

  it('주문 오류 code별 처리: 다시 계산·뺄 쿠폰. 쿠폰과 관계없는 오류는 null', () => {
    expect(couponOrderError('ORDER_QUOTE_CHANGED', null)).toMatchObject({
      requote: true,
      drop: null,
    })
    expect(
      couponOrderError('COUPON_RESERVATION_REJECTED', {
        couponCode: 'COUPON_NOT_USABLE',
        memberCouponId: 11,
      }),
    ).toEqual({
      message: '이미 쓰였거나 만료된 쿠폰이에요.',
      memberCouponId: 11,
      requote: true,
      drop: 'rejected',
    })
    expect(
      couponOrderError('COUPON_PLATFORM_FUNDING_UNAVAILABLE', null),
    ).toMatchObject({ message: PLATFORM_UNAVAILABLE, drop: 'platform' })
    expect(couponOrderError('COUPON_UNAVAILABLE', null)).toMatchObject({
      requote: false,
    })
    expect(couponOrderError('INSUFFICIENT_BALANCE', null)).toBeNull()
  })
})

describe('플랫폼 쿠폰 주문 거절', () => {
  const body = { couponCode: 'COUPON_NOT_USABLE', memberCouponId: 21 }

  it('거절된 쿠폰이 플랫폼 쿠폰이면 플랫폼 쿠폰은 아직 쓸 수 없다고 하고 그 쿠폰을 뺀다', () => {
    expect(
      couponOrderError('COUPON_CALCULATION_REJECTED', body, () => 'PLATFORM'),
    ).toEqual({
      message: PLATFORM_UNAVAILABLE,
      memberCouponId: 21,
      requote: true,
      drop: 'platform',
    })
  })

  it('판매자 쿠폰이거나 종류를 모르면 일반 사용 불가 문구', () => {
    for (const type of ['SELLER', undefined] as const)
      expect(
        couponOrderError('COUPON_CALCULATION_REJECTED', body, () => type),
      ).toMatchObject({
        message: '이미 쓰였거나 만료된 쿠폰이에요.',
        drop: 'rejected',
      })
  })
})

describe('미리보기 실패 문구', () => {
  it('강의 수 초과·쿠폰 사유·그 밖', () => {
    expect(quoteFailure('COUPON_TOO_MANY_ITEMS')).toBe(
      '한 번에 쿠폰을 쓸 수 있는 강의 수를 넘었어요.',
    )
    expect(quoteFailure('COUPON_STACKING_VIOLATION')).toBe(
      '함께 쓸 수 없는 쿠폰이에요.',
    )
    expect(quoteFailure('LECTURE_CATALOG_UNAVAILABLE')).toBe(
      '쿠폰 할인을 계산하지 못했어요.',
    )
    expect(quoteFailure(undefined)).toBe('쿠폰 할인을 계산하지 못했어요.')
  })
})
