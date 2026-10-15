import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { allPages } from '@/shared/api/allPages'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import { uploadBody, type UploadOptions } from '@/shared/api/upload'
import type {
  ContentAccess,
  LectureDetail,
  LectureFileInput,
  LectureRegisterInput,
  LectureSort,
  LectureSummary,
  MyLecture,
  Review,
  Sale,
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
  mine: (page: number) => [...lectureKeys.all, 'mine', page] as const,
  sales: (page: number) => [...lectureKeys.all, 'sales', page] as const,
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

/** 판매자 화면(/studio) 목록 크기. BE 기본값과 같다. */
export const STUDIO_PAGE_SIZE = 20

/** 내가 등록한 강의. 검수 대기·반려·삭제한 강의도 담는다. */
export const myLecturesQuery = (page: number) =>
  queryOptions({
    queryKey: lectureKeys.mine(page),
    queryFn: () =>
      api<PagedModel<MyLecture>>('/lectures/me', {
        query: { page, size: STUDIO_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  })

/** 내 강의 판매 내역. 최근 구매순이고 취소·반환도 담는다. */
export const salesQuery = (page: number) =>
  queryOptions({
    queryKey: lectureKeys.sales(page),
    queryFn: () =>
      api<PagedModel<Sale>>('/lectures/sales', {
        query: { page, size: STUDIO_PAGE_SIZE },
      }),
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

/** 목록 노출과 신규 판매만 멈춘다(soft delete). 이미 삭제한 강의도 204다. */
export function deleteLecture(lectureId: number) {
  return api<void>(`/lectures/${lectureId}`, { method: 'DELETE' })
}

/**
 * 강의 파일 올리기 1단계: 파일 정보를 등록하고 fileId를 받는다(PENDING).
 * 업로드가 실패하거나 끊기면 다시 올릴 때 이 단계부터 새로 한다.
 */
export function registerLectureFile(
  input: LectureFileInput,
  signal?: AbortSignal,
) {
  return api<{ fileId: number }>('/lectures/files', {
    method: 'POST',
    body: input,
    signal,
  })
}

/** 강의 파일 올리기 2단계: 본문을 그대로 올린다. 성공하면 파일이 UPLOADED가 된다 */
export function uploadLectureFileContent(
  fileId: number,
  file: Blob,
  options: UploadOptions,
) {
  return uploadBody(`/lectures/files/${fileId}/content`, file, options)
}

/** 강의 등록. 검수 대기(PENDING_INSPECTION, 비공개)로 시작한다 */
export function createLecture(input: LectureRegisterInput) {
  return api<{ id: number }>('/lectures', { method: 'POST', body: input })
}
