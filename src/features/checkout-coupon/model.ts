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

/** 강의마다 쿠폰 칸 두 개(중첩 A): 판매자 쿠폰 1장, 플랫폼 쿠폰 1장. 판매자 먼저 적용한다 */
export type CouponSlot = CouponType

/** 고를 때 필요한 쿠폰 정보(종류·단독 사용) */
export type CouponInfo = { couponType: CouponType; stackable: boolean }

/**
 * 직접 선택 규칙. 지금 매핑(current)에서 한 강의의 한 칸을 바꾼 새 매핑을 돌려준다.
 * - 같은 칸은 교체한다(칸마다 최대 1장)
 * - 한 쿠폰은 한 강의에만: 다른 강의에 쓰던 쿠폰을 고르면 그쪽에서 빠진다
 * - 단독 사용(stackable=false) 쿠폰은 같은 강의의 다른 칸과 함께 쓰지 않는다(새로 고른 쪽만 남긴다)
 * - memberCouponId가 null이면 그 칸을 비운다
 * 순서는 주문 강의 순서, 강의 안은 판매자 → 플랫폼이다
 */
export function chooseCoupon(
  current: CouponSelection[],
  choice: {
    lectureId: number
    slot: CouponSlot
    memberCouponId: number | null
  },
  infoOf: (memberCouponId: number) => CouponInfo | undefined,
  lectureOrder: number[],
): CouponSelection[] {
  const slotOf = (s: CouponSelection) => infoOf(s.memberCouponId)?.couponType
  const chosen =
    choice.memberCouponId === null ? undefined : infoOf(choice.memberCouponId)
  const next = current.filter((s) => {
    if (s.memberCouponId === choice.memberCouponId) return false
    if (s.lectureId !== choice.lectureId) return true
    if (slotOf(s) === choice.slot) return false
    // 같은 강의의 다른 칸: 새로 고른 쿠폰이나 그 칸 쿠폰이 단독 사용이면 뺀다
    if (chosen && !chosen.stackable) return false
    return chosen === undefined || infoOf(s.memberCouponId)?.stackable !== false
  })
  if (choice.memberCouponId !== null)
    next.push({
      memberCouponId: choice.memberCouponId,
      lectureId: choice.lectureId,
    })
  const rank = (s: CouponSelection) =>
    lectureOrder.indexOf(s.lectureId) * 2 + (slotOf(s) === 'PLATFORM' ? 1 : 0)
  return next.sort((a, b) => rank(a) - rank(b))
}

/** 플랫폼 쿠폰을 뺀 매핑(플랫폼 재원이 없는 동안 추천에 섞여 오면 이 매핑으로 다시 계산한다) */
export function withoutPlatform(quote: CouponQuote): CouponSelection[] {
  return quote.items.flatMap((item) =>
    [...item.coupons]
      .sort((a, b) => a.applyOrder - b.applyOrder)
      .filter((c) => c.couponType !== 'PLATFORM')
      .map((c) => ({
        memberCouponId: c.memberCouponId,
        lectureId: item.lectureId,
      })),
  )
}

export const hasPlatformCoupon = (quote: CouponQuote) =>
  quote.items.some((item) =>
    item.coupons.some((c) => c.couponType === 'PLATFORM'),
  )
