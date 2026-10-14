import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { allPages } from '@/shared/api/allPages'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  ContentAccess,
  LectureDetail,
  LectureSort,
  LectureSummary,
  Review,
} from './types'

export type LectureListParams = {
  keyword?: string
  sort: LectureSort
  page: number
}

export const lectureKeys = {
  all: ['lecture'] as const,
  list: (params: LectureListParams) =>
    [...lectureKeys.all, 'list', params] as const,
  detail: (lectureId: number) =>
    [...lectureKeys.all, 'detail', lectureId] as const,
  reviews: (lectureId: number) =>
    [...lectureKeys.all, 'reviews', lectureId] as const,
  access: (lectureId: number, contentId: number) =>
    [...lectureKeys.all, 'access', lectureId, contentId] as const,
}

export const LECTURE_PAGE_SIZE = 12

export const lecturesQuery = (params: LectureListParams) =>
  queryOptions({
    queryKey: lectureKeys.list(params),
    queryFn: () =>
      api<PagedModel<LectureSummary>>('/lectures', {
        query: {
          keyword: params.keyword || undefined,
          sort: params.sort,
          page: params.page,
          size: LECTURE_PAGE_SIZE,
        },
      }),
    // 검색어·정렬·페이지를 바꾸는 동안 이전 목록을 그대로 보여 준다.
    placeholderData: keepPreviousData,
  })

export const lectureQuery = (lectureId: number) =>
  queryOptions({
    queryKey: lectureKeys.detail(lectureId),
    queryFn: () => api<LectureDetail>(`/lectures/${lectureId}`),
  })

/** 기존 리뷰 수정 여부를 판단할 수 있도록 모든 페이지를 조회한다. */
export const reviewsQuery = (lectureId: number) =>
  queryOptions({
    queryKey: lectureKeys.reviews(lectureId),
    queryFn: () => allPages<Review>(`/lectures/${lectureId}/reviews`),
  })

/** 콘텐츠 시청 URL. 만료 1분 전까지 다시 발급하지 않는다. */
export const contentAccessQuery = (lectureId: number, contentId: number) =>
  queryOptions({
    queryKey: lectureKeys.access(lectureId, contentId),
    queryFn: () =>
      api<ContentAccess>(`/lectures/${lectureId}/contents/${contentId}/access`),
    staleTime: 50 * 60_000,
    gcTime: 50 * 60_000,
  })

export type ReviewInput = { rating: number; content: string }

export function createReview(
  lectureId: number,
  orderItemId: number,
  input: ReviewInput,
) {
  return api<{ id: number }>(`/lectures/${lectureId}/reviews`, {
    method: 'POST',
    body: { orderItemId, ...input },
  })
}

export function updateReview(reviewId: number, input: ReviewInput) {
  return api<void>(`/lectures/reviews/${reviewId}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteReview(reviewId: number) {
  return api<void>(`/lectures/reviews/${reviewId}`, { method: 'DELETE' })
}
