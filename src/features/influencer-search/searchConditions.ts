import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import {
  SEARCH_CATEGORY_MAX,
  SEARCH_KEYWORD_MAX,
  type InfluencerSearchConditions,
  type InfluencerSearchSort,
} from '@/entities/member/search'

/** 인증 여부 필터: 전체 / 인증된 인플루언서 / 인증 안 된 인플루언서 */
export const VERIFIED_OPTIONS: readonly [boolean | undefined, string][] = [
  [undefined, '전체'],
  [true, '인증된 인플루언서'],
  [false, '인증 안 된 인플루언서'],
]

export const MIN_FOLLOWER_OPTIONS: readonly [number | undefined, string][] = [
  [undefined, '팔로워 전체'],
  [1_000, '팔로워 1천 명 이상'],
  [10_000, '팔로워 1만 명 이상'],
  [100_000, '팔로워 10만 명 이상'],
]

export const MIN_RATING_OPTIONS: readonly [number | undefined, string][] = [
  [undefined, '평점 전체'],
  [3, '★ 3.0 이상'],
  [4, '★ 4.0 이상'],
  [4.5, '★ 4.5 이상'],
]

export const SORT_OPTIONS: readonly [
  InfluencerSearchSort | undefined,
  string,
][] = [
  [undefined, '기본 순서'],
  ['followers', '팔로워 많은 순'],
  ['rating', '출연 평점 높은 순'],
]

/** 선택지에 있는 값만 받는다(직접 고친 URL의 다른 값은 조건 없음으로 본다) */
function pick<T>(
  options: readonly [T | undefined, string][],
  raw: string | null,
): T | undefined {
  return options.find(
    ([value]) => value !== undefined && String(value) === raw,
  )?.[0]
}

/**
 * URL 쿼리(?keyword=&contentCategories=A,B&verified=&minFollowers=&minRating=&sort=)를 검색 조건으로 읽는다.
 * 쓸 수 없는 값은 버리고 길이·개수는 BE 한도로 자른다
 */
export function parseConditions(
  params: URLSearchParams,
): InfluencerSearchConditions {
  const codes = (params.get('contentCategories') ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
  return {
    keyword: (params.get('keyword') ?? '').trim().slice(0, SEARCH_KEYWORD_MAX),
    contentCategories: [...new Set(codes)].slice(0, SEARCH_CATEGORY_MAX),
    verified: pick(VERIFIED_OPTIONS, params.get('verified')),
    minFollowers: pick(MIN_FOLLOWER_OPTIONS, params.get('minFollowers')),
    minRating: pick(MIN_RATING_OPTIONS, params.get('minRating')),
    sort: pick(SORT_OPTIONS, params.get('sort')),
  }
}

/** 검색 조건을 URL 쿼리로. 조건이 없는 값은 빼고, 페이지는 첫 페이지로 돌린다(page를 넣지 않는다) */
export function conditionsToParams(
  c: InfluencerSearchConditions,
): URLSearchParams {
  const params = new URLSearchParams()
  if (c.keyword) params.set('keyword', c.keyword)
  if (c.contentCategories.length > 0)
    params.set('contentCategories', c.contentCategories.join(','))
  if (c.verified !== undefined) params.set('verified', String(c.verified))
  if (c.minFollowers !== undefined)
    params.set('minFollowers', String(c.minFollowers))
  if (c.minRating !== undefined) params.set('minRating', String(c.minRating))
  if (c.sort) params.set('sort', c.sort)
  return params
}

/**
 * 인플루언서 검색 조건을 URL에 두고 읽는다(뒤로 가기·새로 고침에도 남는다). 조건을 바꾸면 첫 페이지로 간다.
 * 바꿀 때는 마지막으로 보낸 조건 위에 합친다. setSearchParams의 함수형 갱신은 아직 끝나지 않은 이동(loader 대기)을
 * 보지 못해, 조건을 연달아 바꾸면 앞서 바꾼 값이 사라지기 때문이다. URL이 실제로 바뀌면(뒤로 가기 포함) 그 값을 기준으로 삼는다.
 */
export function useSearchConditions() {
  const [params, setParams] = useSearchParams()
  const conditions = parseConditions(params)
  const query = params.toString()
  const latest = useRef(query)
  useEffect(() => {
    latest.current = query
  }, [query])

  const navigate = (next: URLSearchParams, replace: boolean) => {
    latest.current = next.toString()
    setParams(next, { replace })
  }
  const update = (
    next: Partial<InfluencerSearchConditions>,
    { replace = false } = {},
  ) =>
    navigate(
      conditionsToParams({
        ...parseConditions(new URLSearchParams(latest.current)),
        ...next,
      }),
      replace,
    )
  const reset = () => navigate(new URLSearchParams(), false)

  return { conditions, update, reset }
}
