import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { isApiError } from '@/shared/api/ApiError'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import { memberKeys } from './api'
import type { ContentCategory, RatingSummary } from './types'

/** 검색어 최대 길이 (BE ApiV1SearchSpec) */
export const SEARCH_KEYWORD_MAX = 100
/** 자동완성 검색어 최대 길이 (BE ApiV1SearchSpec). 본 검색(100자)보다 짧아 넘는 부분은 잘라 보낸다 */
export const SUGGESTION_KEYWORD_MAX = 50
/** 콘텐츠 분야 필터 최대 개수 (BE ApiV1SearchSpec) */
export const SEARCH_CATEGORY_MAX = 10
/** 앞에서부터 볼 수 있는 검색 결과 수. totalElements도 여기까지만 센다 (BE InfluencerSearchFacade) */
export const SEARCH_RESULT_WINDOW = 1000
/** 검색 한 페이지. 1,000을 나누어떨어지게 두어 마지막 페이지도 볼 수 있는 범위 안에 든다 */
export const INFLUENCER_SEARCH_PAGE_SIZE = 20

/** 검색 결과가 1,000건을 넘는 페이지를 요청함 */
export const PAGE_TOO_DEEP = 'PAGE_TOO_DEEP'
/** 검색 서버에 닿지 못함. 회원 앱의 인플루언서 목록은 그대로 쓸 수 있다 */
export const SEARCH_UNAVAILABLE = 'SEARCH_UNAVAILABLE'

/**
 * 정렬. 없으면 기본 순서(검색어가 있으면 관련도순, 분야만 여러 개면 많이 맞는 순, 그 밖에는 팔로워 많은 순)
 * - followers: 팔로워 많은 순
 * - rating: 출연 평점 높은 순. 리뷰가 적으면 전체 평균 쪽으로 보정해 정렬한다(보이는 평균은 보정 전 값)
 */
export type InfluencerSearchSort = 'followers' | 'rating'

export type InfluencerSearchConditions = {
  /** 닉네임·채널 이름·콘텐츠 분야 이름·자기소개에서 찾는다. 빈 문자열이면 검색어 없음 */
  keyword: string
  /** 분야 code. 하나라도 가진 사람(OR), 많이 맞을수록 위 */
  contentCategories: readonly string[]
  /** true 인증된 인플루언서만, false 인증 안 된 인플루언서만, undefined 모두 */
  verified?: boolean
  /** 팔로워 최소값(팔로워가 가장 많은 채널 기준) */
  minFollowers?: number
  /** 출연 평점 최소값(원래 평균). 리뷰가 없는 사람은 빠진다 */
  minRating?: number
  sort?: InfluencerSearchSort
}

/** GET /search/influencers 한 줄. 프로필 사진은 없다(회원 사진 일괄 조회로 채운다) */
export type InfluencerSearchItem = {
  id: number
  nickname: string
  /** INFLUENCER 또는 VERIFIED_INFLUENCER */
  role: string
  /** 고른 순서. 드물게 name이 null이다 */
  contentCategories: ContentCategory[]
  bio: string | null
  /** 대표 채널(팔로워가 가장 많은 채널) 이름. 채널이 없거나 통계를 아직 못 받았으면 null */
  channelName: string | null
  /** 대표 채널 팔로워 수. 채널이 없으면 0 */
  followerCount: number
  /** 받은 출연 리뷰 전체 평점(원래 평균) */
  appearanceRating: RatingSummary
}

/** 검색어나 필터·정렬이 하나라도 있는지. 없으면 회원 앱의 인플루언서 목록을 쓴다 */
export function hasSearchConditions(c: InfluencerSearchConditions) {
  return (
    c.keyword !== '' ||
    c.contentCategories.length > 0 ||
    c.verified !== undefined ||
    c.minFollowers !== undefined ||
    c.minRating !== undefined ||
    c.sort !== undefined
  )
}

/**
 * 인플루언서 검색(로그인 회원). 조건이 바뀌는 동안 이전 결과를 두고(흐리게 보인다), 늦게 온 이전 조건의 응답은
 * 그 조건의 캐시에만 들어가 화면에 섞이지 않는다.
 * 503 SEARCH_UNAVAILABLE은 다시 시도하지 않고 바로 알린다(기본 목록으로 돌아갈 수 있다)
 */
export const influencerSearchQuery = (
  conditions: InfluencerSearchConditions,
  page: number,
) =>
  queryOptions({
    queryKey: [
      ...memberKeys.all,
      'search',
      { ...conditions, contentCategories: [...conditions.contentCategories] },
      page,
    ] as const,
    queryFn: ({ signal }) =>
      api<PagedModel<InfluencerSearchItem>>('/search/influencers', {
        query: {
          keyword: conditions.keyword || undefined,
          contentCategories:
            conditions.contentCategories.length > 0
              ? conditions.contentCategories.join(',')
              : undefined,
          verified: conditions.verified,
          minFollowers: conditions.minFollowers,
          minRating: conditions.minRating,
          sort: conditions.sort && `${conditions.sort},desc`,
          page,
          size: INFLUENCER_SEARCH_PAGE_SIZE,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
    retry: (count, error) => !isApiError(error) && count < 2,
  })

/** GET /search/influencers/suggestions 후보 하나. 닉네임 낱말 앞부분(초성·치는 도중의 글자 포함)으로 걸린다 */
export type InfluencerSuggestion = {
  userId: number
  nickname: string
}

/** 서버처럼 앞뒤·연속 공백을 정리하고 자동완성 최대 길이로 자른다. 비면 빈 문자열(부르지 않는다)이다 */
export function suggestionKeyword(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, SUGGESTION_KEYWORD_MAX)
    .trim()
}

/**
 * 인플루언서 검색어 자동완성(로그인 회원). 후보는 최대 5개이고 호출 제한은 없다.
 * 실패(503·연결 끊김)하면 부른 쪽이 후보만 숨기므로 다시 부르지 않는다. 쓰지 않게 된 요청은 signal로 끊는다
 */
export const influencerSuggestionsQuery = (keyword: string) =>
  queryOptions({
    queryKey: [...memberKeys.all, 'search-suggestions', keyword] as const,
    queryFn: ({ signal }) =>
      api<InfluencerSuggestion[]>('/search/influencers/suggestions', {
        query: { keyword },
        signal,
      }),
    staleTime: 60_000,
    retry: false,
  })
