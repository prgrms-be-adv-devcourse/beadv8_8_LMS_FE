import { queryOptions } from '@tanstack/react-query'
import { isApiError } from '@/shared/api/ApiError'
import { api } from '@/shared/api/client'
import { memberKeys } from './api'
import type { ContentCategory } from './types'

/** 인플루언서 한 명이 고를 수 있는 콘텐츠 분야 수 (BE ContentCategories) */
export const CONTENT_CATEGORY_MAX = 5

/** 자기소개 최대 길이. 앞뒤 공백을 지운 뒤 센다(BE Bio, String.length = JS length) */
export const BIO_MAX = 100

/** 내 정보 수정이 콘텐츠 분야·자기소개 때문에 실패한 오류 code */
export const CONTENT_CATEGORY_ERROR_CODES = new Set([
  'INVALID_CONTENT_CATEGORY_COUNT',
  'DUPLICATE_CONTENT_CATEGORY',
  'INVALID_CONTENT_CATEGORY',
])
export const BIO_ERROR_CODE = 'INVALID_BIO_LENGTH'
/** 인플루언서가 아닌데 분야·자기소개를 새로 넣거나 바꿈(요청 전체가 거절되고 닉네임도 바뀌지 않는다) */
export const INFLUENCER_PROFILE_NOT_ALLOWED = 'INFLUENCER_PROFILE_NOT_ALLOWED'

/** 고를 수 있는 분야(code·이름이 모두 있다) */
export type SelectableCategory = { code: string; name: string }

/**
 * 지금 고를 수 있는 콘텐츠 분야 전부(페이지 없음). 정상 인플루언서가 많이 고른 순, 같으면 이름순이다.
 * 운영자가 끈 분야는 빠진다(이미 고른 회원의 프로필에는 남는다). 자주 바뀌지 않아 오래 캐시한다.
 * 고르는 칸의 자동완성은 이 목록을 화면에서 거른다(검색 API를 부르지 않는다)
 */
export const contentCategoriesQuery = queryOptions({
  queryKey: memberKeys.contentCategories(),
  queryFn: () => api<SelectableCategory[]>('/members/content-categories'),
  staleTime: 30 * 60_000,
  // 고르는 칸에 다시 시도 버튼이 있어 자동 재시도는 한 번만 한다(4xx는 하지 않는다).
  retry: (count, error) =>
    !(isApiError(error) && error.status < 500) && count < 1,
})

/**
 * 칩에 보일 이름. 받은 이름이 없으면 분야 목록에서 code로 찾고, 그래도 없으면 null(그 칩은 숨긴다)
 */
export function categoryName(
  category: ContentCategory,
  list: readonly SelectableCategory[] | undefined,
): string | null {
  return (
    category.name ?? list?.find((c) => c.code === category.code)?.name ?? null
  )
}
