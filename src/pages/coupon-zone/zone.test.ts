import { describe, expect, it } from 'vitest'
import type { CouponTargetType } from '@/entities/coupon/types'
import { issuableCoupon } from '@/test/couponMock'
import { groupIssuable, issuableOrder } from './zone'

const ids = (list: { couponId: number }[]) => list.map((c) => c.couponId)

describe('받을 수 있는 쿠폰 나누기', () => {
  it('모든 강의 쿠폰과 강의별 쿠폰으로 나누고, 강의는 응답에 처음 나온 차례로 강의 제목과 함께 묶는다', () => {
    const groups = groupIssuable([
      issuableCoupon({ couponId: 1, lectureId: 8, lectureTitle: '강의 8' }),
      issuableCoupon({
        couponId: 2,
        targetType: 'ANY_LECTURE',
        lectureId: null,
      }),
      issuableCoupon({ couponId: 3, lectureId: 7, lectureTitle: '강의 7' }),
      issuableCoupon({ couponId: 4, lectureId: 8, lectureTitle: '강의 8' }),
    ])
    expect(ids(groups.anyLecture)).toEqual([2])
    expect(
      groups.byLecture.map((g) => [
        g.lectureId,
        g.lectureTitle,
        ids(g.coupons),
      ]),
    ).toEqual([
      [8, '강의 8', [1, 4]],
      [7, '강의 7', [3]],
    ])
    expect(groups.other).toEqual([])
  })

  it('강의 제목은 그 강의 쿠폰 중 제목이 온 것을 쓰고, 하나도 없으면 null이다', () => {
    const groups = groupIssuable([
      issuableCoupon({ couponId: 1, lectureId: 8, lectureTitle: null }),
      issuableCoupon({ couponId: 2, lectureId: 8, lectureTitle: '강의 8' }),
      issuableCoupon({ couponId: 3, lectureId: 9, lectureTitle: null }),
    ])
    expect(groups.byLecture.map((g) => g.lectureTitle)).toEqual([
      '강의 8',
      null,
    ])
  })

  it('모르는 대상 종류나 강의가 없는 강의 쿠폰은 어느 쪽으로도 단정하지 않고 따로 둔다', () => {
    const groups = groupIssuable([
      issuableCoupon({
        couponId: 1,
        targetType: 'CATEGORY' as CouponTargetType,
        lectureId: null,
      }),
      issuableCoupon({ couponId: 2, lectureId: null }),
    ])
    expect(groups.anyLecture).toEqual([])
    expect(groups.byLecture).toEqual([])
    expect(ids(groups.other)).toEqual([1, 2])
  })
})

describe('모두 받기 순서', () => {
  it('모든 강의 → 강의별 → 그 밖의 쿠폰 순서다', () => {
    const groups = groupIssuable([
      issuableCoupon({ couponId: 1, lectureId: 8 }),
      issuableCoupon({
        couponId: 2,
        targetType: 'ANY_LECTURE',
        lectureId: null,
      }),
      issuableCoupon({ couponId: 3, lectureId: null }),
      issuableCoupon({ couponId: 4, lectureId: 7 }),
      issuableCoupon({ couponId: 5, lectureId: 8 }),
    ])
    expect(ids(issuableOrder(groups))).toEqual([2, 1, 5, 4, 3])
  })
})
