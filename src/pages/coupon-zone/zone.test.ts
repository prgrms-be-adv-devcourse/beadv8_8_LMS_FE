import { describe, expect, it } from 'vitest'
import type { CouponTargetType } from '@/entities/coupon/types'
import type { LectureDetail } from '@/entities/lecture/types'
import { ApiError } from '@/shared/api/ApiError'
import { couponSummary } from '@/test/couponMock'
import {
  groupIssuable,
  issuableOrder,
  lectureLookupOf,
  shownCount,
  zoneViewOf,
  type LectureLookup,
} from './zone'

const ids = (list: { couponId: number }[]) => list.map((c) => c.couponId)

const problem = (status: number, code: string) =>
  new ApiError(status, { status, code, detail: code })

const lecture = (patch: Partial<LectureDetail> = {}) =>
  ({
    title: '첫 방송 세팅',
    status: 'ON_SALE',
    deleted: false,
    ...patch,
  }) as LectureDetail

describe('받을 수 있는 쿠폰 나누기', () => {
  it('모든 강의 쿠폰과 강의별 쿠폰으로 나누고, 강의는 응답에 처음 나온 차례로 묶는다', () => {
    const groups = groupIssuable([
      couponSummary({ couponId: 1, lectureId: 8 }),
      couponSummary({
        couponId: 2,
        targetType: 'ANY_LECTURE',
        lectureId: null,
      }),
      couponSummary({ couponId: 3, lectureId: 7 }),
      couponSummary({ couponId: 4, lectureId: 8 }),
    ])
    expect(ids(groups.anyLecture)).toEqual([2])
    expect(groups.byLecture.map((g) => [g.lectureId, ids(g.coupons)])).toEqual([
      [8, [1, 4]],
      [7, [3]],
    ])
    expect(groups.other).toEqual([])
  })

  it('모르는 대상 종류나 강의가 없는 강의 쿠폰은 어느 쪽으로도 단정하지 않고 따로 둔다', () => {
    const groups = groupIssuable([
      couponSummary({
        couponId: 1,
        targetType: 'CATEGORY' as CouponTargetType,
        lectureId: null,
      }),
      couponSummary({ couponId: 2, lectureId: null }),
    ])
    expect(groups.anyLecture).toEqual([])
    expect(groups.byLecture).toEqual([])
    expect(ids(groups.other)).toEqual([1, 2])
  })
})

describe('강의 조회 결과', () => {
  it('판매 중인 강의면 제목, 판매 중이 아니거나(삭제·검수 중·반려·모르는 상태) 404면 없는 강의, 그 밖의 실패는 실패다', () => {
    expect(lectureLookupOf({ data: lecture(), error: null })).toEqual({
      state: 'found',
      title: '첫 방송 세팅',
    })
    for (const patch of [
      { deleted: true },
      { status: 'PENDING_INSPECTION' },
      { status: 'REJECTED' },
      { status: 'SOMETHING_NEW' },
    ] as Partial<LectureDetail>[])
      expect(lectureLookupOf({ data: lecture(patch), error: null })).toEqual({
        state: 'gone',
      })
    expect(
      lectureLookupOf({ error: problem(404, 'LECTURE_NOT_FOUND') }),
    ).toEqual({ state: 'gone' })
    expect(lectureLookupOf({ error: problem(503, 'UNAVAILABLE') })).toEqual({
      state: 'failed',
    })
    expect(lectureLookupOf({ error: new TypeError('network') })).toEqual({
      state: 'failed',
    })
    expect(lectureLookupOf({ error: null })).toEqual({ state: 'loading' })
    // 다시 불러오다 실패해도 이미 받은 강의를 따른다.
    expect(
      lectureLookupOf({ data: lecture(), error: problem(503, 'UNAVAILABLE') }),
    ).toEqual({ state: 'found', title: '첫 방송 세팅' })
  })
})

describe('화면에 둘 쿠폰과 모두 받기 순서', () => {
  const groups = groupIssuable([
    couponSummary({ couponId: 1, lectureId: 8 }),
    couponSummary({ couponId: 2, targetType: 'ANY_LECTURE', lectureId: null }),
    couponSummary({ couponId: 3, lectureId: 7 }),
    couponSummary({ couponId: 4, lectureId: 9 }),
    couponSummary({ couponId: 5, lectureId: 10 }),
  ])
  const lookups: Record<number, LectureLookup> = {
    7: { state: 'found', title: '첫 방송 세팅' },
    8: { state: 'gone' },
    9: { state: 'failed' },
    10: { state: 'loading' },
  }
  const view = zoneViewOf(groups, (lectureId) => lookups[lectureId])

  it('없는 강의의 쿠폰은 빼고, 확인 중·못 불러온 강의의 쿠폰은 둔다', () => {
    expect(view.byLecture.map((g) => g.lectureId)).toEqual([7, 9, 10])
    expect(shownCount(view)).toBe(4)
  })

  it('모두 받기는 모든 강의 → 강의별 순서이고, 강의를 확인하는 중인 쿠폰은 넣지 않는다', () => {
    expect(ids(issuableOrder(view))).toEqual([2, 3, 4])
  })
})
