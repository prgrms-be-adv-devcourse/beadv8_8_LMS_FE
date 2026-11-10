import { useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { couponQuoteQuery, usableCouponsQuery } from '@/entities/coupon/api'
import type { CouponSelection, MemberCoupon } from '@/entities/coupon/types'
import {
  orderCouponsOf,
  quoteView,
  type CheckoutLine,
  type CouponView,
} from './model'

export type CheckoutCoupons = ReturnType<typeof useCheckoutCoupons>

/**
 * 주문 확인의 쿠폰 할인. 열면 추천(selections null)으로 미리보기를 부르고, 결과를 화면 모델로 바꾼다.
 * - 미리보기 중(다시 계산 포함)에는 결제를 막는다(pending)
 * - 쿠폰을 적용한 결과일 때만 결제액·주문 쿠폰을 미리보기 응답에서 가져온다. 쿠폰이 없거나 실패하면 쿠폰 없는 주문이다
 */
export function useCheckoutCoupons(lines: CheckoutLine[]) {
  const lectureIds = lines.map((l) => l.lectureId)
  // null: 추천, []: 쿠폰 안 쓰기, 값: 직접 고른 매핑
  const [selections, setSelections] = useState<CouponSelection[] | null>(null)
  const quote = useQuery({
    ...couponQuoteQuery(lectureIds, selections),
    enabled: lines.length > 0,
  })
  // 쿠폰 이름(미리보기 결과에는 없다)과 직접 선택 목록
  const usable = useQueries({
    queries: lectureIds.map((lectureId) => usableCouponsQuery(lectureId)),
    combine: (results) => ({
      byLecture: new Map(
        lectureIds.map((lectureId, i) => [lectureId, results[i]] as const),
      ),
      all: results.flatMap((r) => r.data ?? []),
    }),
  })
  const nameOf = (memberCouponId: number) =>
    usable.all.find((c: MemberCoupon) => c.memberCouponId === memberCouponId)
      ?.couponName

  const pending = quote.isFetching
  const settled = quote.isSuccess && !pending
  const view: CouponView | undefined = quote.data
    ? quoteView(quote.data, lines, nameOf)
    : undefined
  // 결제는 마지막으로 성공한 미리보기에서만 쿠폰을 가져온다(실패·계산 중이면 쿠폰 없음)
  const orderCoupons = settled ? orderCouponsOf(quote.data) : null
  const listTotal = lines.reduce((sum, l) => sum + l.priceHp, 0)

  return {
    selections,
    setSelections,
    quote,
    usable,
    view,
    pending,
    /** 미리보기에 실패해 쿠폰 없이(정가로) 결제한다 */
    failed: quote.isError && !pending,
    orderCoupons,
    /** 결제할 HP. 쿠폰을 적용했으면 미리보기 결제액, 아니면 강의 가격 합(쿠폰 없는 주문과 같다) */
    amount: orderCoupons ? quote.data!.totalBuyerAmount : listTotal,
  }
}
