import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  couponKeys,
  couponQuery,
  couponQuoteQuery,
  usableCouponsQuery,
} from '@/entities/coupon/api'
import type {
  CouponSelection,
  CouponType,
  MemberCoupon,
} from '@/entities/coupon/types'
import { isApiError } from '@/shared/api/ApiError'
import {
  chooseCoupon,
  couponOrderError,
  hasPlatformCoupon,
  orderCouponsOf,
  quoteView,
  selectionsOf,
  withoutPlatform,
  type CheckoutLine,
  type CouponInfo,
  type CouponOrderError,
  type CouponSlot,
  type CouponView,
} from './model'

export type CheckoutCoupons = ReturnType<typeof useCheckoutCoupons>

/** 직접 선택 칸의 쿠폰 한 장 */
export type PickableCoupon = MemberCoupon & {
  /** 쿠폰 종류. 아직 모르면(상세를 불러오는 중·실패) undefined */
  type: CouponType | undefined
}

/**
 * 주문 확인의 쿠폰 할인. 열면 추천(selections null)으로 미리보기를 부르고, 결과를 화면 모델로 바꾼다.
 * - 직접 고르면 그 매핑으로, '쿠폰 안 쓰기'는 []로, '추천으로 돌아가기'는 null로 다시 계산한다
 * - 플랫폼 쿠폰은 아직 쓸 수 없다. 추천에 섞여 오면 그 쿠폰만 뺀 매핑으로 한 번 더 계산한다
 * - 미리보기 중(다시 계산 포함)에는 결제를 막는다(pending)
 * - 쿠폰을 적용한 결과일 때만 결제액·주문 쿠폰을 미리보기 응답에서 가져온다. 쿠폰이 없거나 실패하면 쿠폰 없는 주문이다
 */
export function useCheckoutCoupons(lines: CheckoutLine[]) {
  const lectureIds = lines.map((l) => l.lectureId)
  const enabled = lines.length > 0
  const queryClient = useQueryClient()
  // null: 추천, []: 쿠폰 안 쓰기, 값: 직접 고른 매핑
  const [selections, setSelectionState] = useState<CouponSelection[] | null>(
    null,
  )
  // 마지막 주문의 쿠폰 오류(매핑을 바꾸면 지운다)
  const [orderError, setOrderError] = useState<CouponOrderError | null>(null)
  const setSelections = (next: CouponSelection[] | null) => {
    setOrderError(null)
    setSelectionState(next)
  }

  // 추천 결과. 플랫폼 쿠폰이 섞여 있으면 뺀 매핑을 대신 계산한다(플랫폼 재원이 없는 동안의 방어)
  const recommend = useQuery({
    ...couponQuoteQuery(lectureIds, null),
    enabled: enabled && selections === null,
  })
  const platformFallback =
    selections === null && recommend.data && hasPlatformCoupon(recommend.data)
      ? withoutPlatform(recommend.data)
      : null
  const quote = useQuery({
    ...couponQuoteQuery(lectureIds, selections ?? platformFallback),
    enabled,
  })

  const usable = useQueries({
    queries: lectureIds.map((lectureId) => usableCouponsQuery(lectureId)),
    combine: (results) => results,
  })
  const allUsable = usable.flatMap((r) => r.data ?? [])
  // 종류는 회원 쿠폰 목록의 couponType을 쓴다. 없을 때만(이전 응답 등) 쿠폰 상세로 채운다. 같은 쿠폰은 한 번만 부르고 오래 캐시한다
  const missingType = [
    ...new Set(allUsable.filter((c) => !c.couponType).map((c) => c.couponId)),
  ]
  const details = useQueries({
    queries: missingType.map((couponId) => couponQuery(couponId)),
    combine: (results) =>
      new Map(
        missingType.map((couponId, i) => [couponId, results[i].data?.type]),
      ),
  })
  const typeOf = (c: MemberCoupon) => c.couponType ?? details.get(c.couponId)
  const find = (memberCouponId: number) =>
    allUsable.find((c) => c.memberCouponId === memberCouponId)
  const infoOf = (memberCouponId: number): CouponInfo | undefined => {
    const found = find(memberCouponId)
    const couponType = found && typeOf(found)
    return found && couponType
      ? { couponType, stackable: found.stackable }
      : undefined
  }

  const pending =
    quote.isFetching || (selections === null && recommend.isFetching)
  const settled = quote.isSuccess && !pending
  const view: CouponView | undefined = quote.data
    ? quoteView(quote.data, lines, (id) => find(id)?.couponName)
    : undefined
  // 결제는 마지막으로 성공한 미리보기에서만 쿠폰을 가져온다(실패·계산 중이면 쿠폰 없음)
  const orderCoupons = settled ? orderCouponsOf(quote.data) : null
  const listTotal = lines.reduce((sum, l) => sum + l.priceHp, 0)
  // 지금 화면에 적용된 매핑(고를 때 이 매핑에서 바꾼다)
  const current = quote.data
    ? selectionsOf(quote.data)
    : (selections ?? platformFallback ?? [])

  return {
    selections,
    quote,
    view,
    pending,
    /** 미리보기에 실패해 쿠폰 없이(정가로) 결제한다 */
    failed: quote.isError && !pending,
    /** 추천에 플랫폼 쿠폰이 섞여 와서 빼고 다시 계산했다 */
    platformRemoved: platformFallback !== null,
    orderCoupons,
    /** 결제할 HP. 쿠폰을 적용했으면 미리보기 결제액, 아니면 강의 가격 합(쿠폰 없는 주문과 같다) */
    amount: orderCoupons ? quote.data!.totalBuyerAmount : listTotal,
    current,
    /** 이 주문에 쓸 수 있는 내 쿠폰이 한 장이라도 있다(직접 선택을 보인다) */
    hasUsable: allUsable.length > 0,
    /** 강의 한 칸에서 고를 수 있는 쿠폰과, 종류를 아직 모르는 쿠폰이 있는지 */
    pickable(lectureId: number, slot: CouponSlot) {
      const list = usable[lectureIds.indexOf(lectureId)]?.data ?? []
      const typed: PickableCoupon[] = list.map((c) => ({
        ...c,
        type: typeOf(c),
      }))
      return {
        coupons: typed.filter((c) => c.type === slot),
        typing: typed.some((c) => c.type === undefined),
        loading: usable[lectureIds.indexOf(lectureId)]?.isPending ?? false,
      }
    },
    /** 한 칸을 바꾸고 그 매핑으로 다시 계산한다(null이면 그 칸을 비운다) */
    choose(lectureId: number, slot: CouponSlot, memberCouponId: number | null) {
      setSelections(
        chooseCoupon(
          current,
          { lectureId, slot, memberCouponId },
          infoOf,
          lectureIds,
        ),
      )
    },
    orderError,
    /** 회원 쿠폰 이름(사용 가능 쿠폰 목록에서). 못 찾으면 undefined */
    couponName: (memberCouponId: number) => find(memberCouponId)?.couponName,
    /**
     * 주문 오류를 쿠폰 영역에서 다룬다. 쿠폰 오류면 문구를 남기고, 필요하면 거절된 쿠폰·플랫폼 쿠폰을 빼고
     * 사용 가능 쿠폰·미리보기를 다시 부른다(같은 모드로 다시 계산한다. 자동으로 다시 주문하지 않는다).
     * 쿠폰과 관계없는 오류면 false
     */
    handleOrderError(error: unknown) {
      if (!isApiError(error)) return false
      // 거절된 쿠폰의 종류: 주문에 쓴 미리보기 결과에서, 없으면 사용 가능 쿠폰 목록에서
      const typeOf = (memberCouponId: number) =>
        quote.data?.items
          .flatMap((item) => item.coupons)
          .find((c) => c.memberCouponId === memberCouponId)?.couponType ??
        infoOf(memberCouponId)?.couponType
      const handled = couponOrderError(error.code, error.body, typeOf)
      if (!handled) return false
      const platformIds = new Set(
        quote.data?.items.flatMap((item) =>
          item.coupons
            .filter((c) => c.couponType === 'PLATFORM')
            .map((c) => c.memberCouponId),
        ),
      )
      const dropped =
        handled.drop === 'rejected'
          ? current.filter((s) => s.memberCouponId !== handled.memberCouponId)
          : handled.drop === 'platform'
            ? current.filter((s) => !platformIds.has(s.memberCouponId))
            : null
      // 추천 모드에서 거절된 쿠폰은 다시 추천하면 빠지므로 그대로 둔다. 직접 고른 매핑·플랫폼 쿠폰은 빼고 계산한다
      if (dropped && (selections !== null || handled.drop === 'platform'))
        setSelectionState(dropped)
      setOrderError(handled)
      if (handled.requote)
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: [...couponKeys.all, 'usable'],
          }),
          queryClient.invalidateQueries({
            queryKey: [...couponKeys.all, 'quote'],
          }),
        ])
      return true
    },
    /** 쿠폰 없이 계산한다 */
    skipCoupons: () => setSelections([]),
    /** 추천으로 돌아간다 */
    backToRecommend: () => setSelections(null),
  }
}
