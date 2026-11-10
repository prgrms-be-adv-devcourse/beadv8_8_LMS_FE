import type {
  CouponQuote,
  CouponSelection,
  CouponType,
} from '@/entities/coupon/types'

/** 주문 확인에 올린 강의 한 줄(장바구니 주문·바로 구매) */
export type CheckoutLine = { lectureId: number; title: string; priceHp: number }

/** 강의에 적용된 쿠폰 한 장(화면용) */
export type AppliedCoupon = {
  memberCouponId: number
  couponType: CouponType
  /** usable의 couponName. 못 찾으면 '쿠폰' */
  name: string
  discount: number
}

/** 강의 한 줄(미리보기 결과, 요청 강의 순서) */
export type CouponRow = {
  lectureId: number
  title: string
  price: number
  discount: number
  buyerAmount: number
  /** 적용 순서대로(판매자 먼저) */
  coupons: AppliedCoupon[]
}

export type CouponView = {
  rows: CouponRow[]
  /** 할인 전 합 */
  totalPrice: number
  totalDiscount: number
  /** 구매자 결제액(totalBuyerAmount) */
  totalBuyerAmount: number
  /** 쿠폰을 한 장이라도 적용했다. 아니면 쿠폰 없는 주문과 같다 */
  applied: boolean
  /** 추천으로 계산했고 최대 할인임을 보장한다(이때만 '최대 할인'이라고 쓴다) */
  optimal: boolean
  recommended: boolean
}

export const UNNAMED_COUPON = '쿠폰'

/**
 * 미리보기 결과 → 화면 모델. 금액은 모두 응답 그대로 쓴다(클라이언트에서 할인을 계산하지 않는다).
 * 제목은 주문 확인에 올린 강의에서, 쿠폰 이름은 nameOf(usable의 couponName)에서 찾는다
 */
export function quoteView(
  quote: CouponQuote,
  lines: CheckoutLine[],
  nameOf: (memberCouponId: number) => string | undefined,
): CouponView {
  const titleOf = new Map(lines.map((l) => [l.lectureId, l.title]))
  const rows = quote.items.map((item): CouponRow => ({
    lectureId: item.lectureId,
    title: titleOf.get(item.lectureId) ?? `강의 #${item.lectureId}`,
    price: item.price,
    discount: item.discount,
    buyerAmount: item.buyerAmount,
    coupons: [...item.coupons]
      .sort((a, b) => a.applyOrder - b.applyOrder)
      .map((c) => ({
        memberCouponId: c.memberCouponId,
        couponType: c.couponType,
        name: nameOf(c.memberCouponId) ?? UNNAMED_COUPON,
        discount: c.discount,
      })),
  }))
  return {
    rows,
    totalPrice: quote.items.reduce((sum, i) => sum + i.price, 0),
    totalDiscount: quote.totalDiscount,
    totalBuyerAmount: quote.totalBuyerAmount,
    applied: rows.some((r) => r.coupons.length > 0),
    optimal: quote.recommended && quote.optimal,
    recommended: quote.recommended,
  }
}

/** 미리보기 결과에 담긴 쿠폰 매핑(요청 강의 순서, 강의 안은 적용 순서) */
export function selectionsOf(quote: CouponQuote): CouponSelection[] {
  return quote.items.flatMap((item) =>
    [...item.coupons]
      .sort((a, b) => a.applyOrder - b.applyOrder)
      .map((c) => ({
        memberCouponId: c.memberCouponId,
        lectureId: item.lectureId,
      })),
  )
}

/**
 * 주문 요청의 쿠폰 부분. 화면 상태가 아니라 마지막으로 성공한 미리보기 응답으로 만든다.
 * 쿠폰이 하나도 없으면 null(coupons·expectedBuyerAmountHp를 보내지 않는다)
 */
export function orderCouponsOf(
  quote: CouponQuote | undefined,
): { coupons: CouponSelection[]; expectedBuyerAmountHp: number } | null {
  if (!quote) return null
  const coupons = selectionsOf(quote)
  return coupons.length > 0
    ? { coupons, expectedBuyerAmountHp: quote.totalBuyerAmount }
    : null
}
