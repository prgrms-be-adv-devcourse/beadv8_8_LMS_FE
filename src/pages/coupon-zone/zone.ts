import type { IssuableCoupon } from '@/entities/coupon/types'

/** 한 강의에 쓰는 쿠폰 묶음 */
export type LectureCoupons = {
  lectureId: number
  /** 강의 제목. 응답에 없으면 null(제목 없이 강의 보기만 둔다) */
  lectureTitle: string | null
  coupons: IssuableCoupon[]
}

export type ZoneGroups = {
  /** 모든 강의에 쓰는 쿠폰 */
  anyLecture: IssuableCoupon[]
  /** 특정 강의 쿠폰을 강의별로. 강의는 응답(최신순)에 처음 나온 차례다 */
  byLecture: LectureCoupons[]
  /** 대상 종류를 모르거나 강의가 없는 쿠폰. 모든 강의·특정 강의로 단정하지 않고 따로 둔다 */
  other: IssuableCoupon[]
}

/** 받을 수 있는 쿠폰 한 쪽을 모든 강의 쿠폰과 강의별 쿠폰으로 나눈다. 각 묶음 안은 응답 순서를 지킨다 */
export function groupIssuable(coupons: IssuableCoupon[]): ZoneGroups {
  const anyLecture: IssuableCoupon[] = []
  const byLecture = new Map<number, LectureCoupons>()
  const other: IssuableCoupon[] = []
  for (const coupon of coupons) {
    if (coupon.targetType === 'ANY_LECTURE') anyLecture.push(coupon)
    else if (coupon.targetType === 'LECTURE' && coupon.lectureId !== null) {
      const group = byLecture.get(coupon.lectureId)
      if (group) {
        group.coupons.push(coupon)
        group.lectureTitle ??= coupon.lectureTitle
      } else
        byLecture.set(coupon.lectureId, {
          lectureId: coupon.lectureId,
          lectureTitle: coupon.lectureTitle,
          coupons: [coupon],
        })
    } else other.push(coupon)
  }
  return { anyLecture, byLecture: [...byLecture.values()], other }
}

/** 받을 수 있는 쿠폰을 화면 순서(모든 강의 → 강의별 → 그 밖)로. 모두 받기도 이 순서로 보낸다 */
export const issuableOrder = ({ anyLecture, byLecture, other }: ZoneGroups) => [
  ...anyLecture,
  ...byLecture.flatMap((group) => group.coupons),
  ...other,
]
