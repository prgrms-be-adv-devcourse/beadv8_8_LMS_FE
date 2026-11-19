import type { CouponSummary } from '@/entities/coupon/types'
import type { LectureDetail } from '@/entities/lecture/types'
import { isApiError } from '@/shared/api/ApiError'

/** 한 강의에 쓰는 쿠폰 묶음 */
export type LectureCoupons = { lectureId: number; coupons: CouponSummary[] }

export type ZoneGroups = {
  /** 모든 강의에 쓰는 쿠폰 */
  anyLecture: CouponSummary[]
  /** 특정 강의 쿠폰을 강의별로. 강의는 응답(최신순)에 처음 나온 차례다 */
  byLecture: LectureCoupons[]
  /** 대상 종류를 모르거나 강의가 없는 쿠폰. 모든 강의·특정 강의로 단정하지 않고 따로 둔다 */
  other: CouponSummary[]
}

/** 받을 수 있는 쿠폰 전체를 모든 강의 쿠폰과 강의별 쿠폰으로 나눈다. 각 묶음 안은 응답 순서를 지킨다 */
export function groupIssuable(coupons: CouponSummary[]): ZoneGroups {
  const anyLecture: CouponSummary[] = []
  const byLecture = new Map<number, CouponSummary[]>()
  const other: CouponSummary[] = []
  for (const coupon of coupons) {
    if (coupon.targetType === 'ANY_LECTURE') anyLecture.push(coupon)
    else if (coupon.targetType === 'LECTURE' && coupon.lectureId !== null) {
      const list = byLecture.get(coupon.lectureId)
      if (list) list.push(coupon)
      else byLecture.set(coupon.lectureId, [coupon])
    } else other.push(coupon)
  }
  return {
    anyLecture,
    byLecture: [...byLecture].map(([lectureId, list]) => ({
      lectureId,
      coupons: list,
    })),
    other,
  }
}

/** 강의별 쿠폰의 강의 조회 결과 */
export type LectureLookup =
  | { state: 'loading' }
  | { state: 'found'; title: string }
  /** 강의가 없거나(404) 판매 중이 아니다(삭제·검수 중·반려). 그 쿠폰은 받아도 쓸 곳이 없다 */
  | { state: 'gone' }
  /** 그 밖의 이유로 못 불러왔다. 제목 없이 강의 보기만 둔다 */
  | { state: 'failed' }

/**
 * 강의 상세 조회 결과를 읽는다. 판매 중(ON_SALE)인 강의만 살 수 있으므로 그 밖의 상태(모르는 값 포함)와 지운 강의는
 * 없는 강의로 본다. 다시 불러오다 실패해도 받은 강의가 있으면 그것을 따른다
 */
export function lectureLookupOf({
  data,
  error,
}: {
  data?: LectureDetail
  error: unknown
}): LectureLookup {
  if (data)
    return data.deleted || data.status !== 'ON_SALE'
      ? { state: 'gone' }
      : { state: 'found', title: data.title }
  if (isApiError(error) && error.status === 404) return { state: 'gone' }
  return error ? { state: 'failed' } : { state: 'loading' }
}

export type ZoneView = Omit<ZoneGroups, 'byLecture'> & {
  byLecture: (LectureCoupons & { lecture: LectureLookup })[]
}

/**
 * 화면에 둘 묶음. 판매 중이 아니거나 없는 강의의 쿠폰은 받아도 쓸 곳이 없어 뺀다
 * (BE는 강의 상태와 관계없이 발급 중인 쿠폰을 모두 준다).
 */
export function zoneViewOf(
  groups: ZoneGroups,
  lookupOf: (lectureId: number) => LectureLookup,
): ZoneView {
  return {
    ...groups,
    byLecture: groups.byLecture
      .map((group) => ({ ...group, lecture: lookupOf(group.lectureId) }))
      .filter((group) => group.lecture.state !== 'gone'),
  }
}

/**
 * 받을 수 있는 쿠폰을 화면 순서(모든 강의 → 강의별 → 그 밖)로. 모두 받기도 이 순서로 보낸다.
 * 강의를 아직 확인하지 못한 쿠폰은 넣지 않는다(판매 중이 아닌 강의의 쿠폰을 받지 않게)
 */
export const issuableOrder = ({ anyLecture, byLecture, other }: ZoneView) => [
  ...anyLecture,
  ...byLecture
    .filter((group) => group.lecture.state !== 'loading')
    .flatMap((group) => group.coupons),
  ...other,
]

/** 화면에 보일 쿠폰 수(강의를 확인하는 중인 쿠폰 포함) */
export const shownCount = ({ anyLecture, byLecture, other }: ZoneView) =>
  anyLecture.length +
  byLecture.reduce((sum, group) => sum + group.coupons.length, 0) +
  other.length
