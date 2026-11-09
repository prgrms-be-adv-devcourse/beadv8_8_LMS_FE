import type { AppearanceRating, RatingSummary } from '@/entities/member/types'

/** 받은 리뷰가 없는 평점 (BE는 average null·count 0을 준다) */
export const noRating: RatingSummary = { average: null, count: 0 }

/** 프로필 상세(GET /members/{memberId})의 받은 리뷰가 없는 출연 평점 */
export const noAppearanceRating: AppearanceRating = {
  total: noRating,
  asHost: noRating,
  asGuest: noRating,
}
