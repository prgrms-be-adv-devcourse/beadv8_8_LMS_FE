import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { allPages } from '@/shared/api/allPages'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import { uploadBody, type UploadOptions } from '@/shared/api/upload'
import { LECTURE_SEARCH_PAGE_SIZE, searchSortOf } from './search'
import type {
  ContentAccess,
  InspectionLecture,
  LectureContentInput,
  LectureDetail,
  LectureFileInput,
  LectureInfoUpdateInput,
  LectureBrowseSort,
  LectureRegisterInput,
  LectureSearchItem,
  LectureSort,
  LectureSuggestion,
  LectureStatus,
  LectureSummary,
  LectureThumbnails,
  MyLecture,
  Review,
  Sale,
} from './types'

export type InspectionListParams = {
  status: LectureStatus
  page: number
}

export type LectureListParams = {
  keyword?: string
  sort: LectureSort
  page: number
}

export type LectureSearchParams = {
  keyword: string
  sort: LectureBrowseSort
  page: number
}

export const lectureKeys = {
  all: ['lecture'] as const,
  list: (params: LectureListParams) =>
    [...lectureKeys.all, 'list', params] as const,
  search: (params: LectureSearchParams) =>
    [...lectureKeys.all, 'search', params] as const,
  suggestions: (keyword: string) =>
    [...lectureKeys.all, 'suggestions', keyword] as const,
  thumbnails: (lectureIds: readonly number[]) =>
    [...lectureKeys.all, 'thumbnails', lectureIds] as const,
  detail: (lectureId: number) =>
    [...lectureKeys.all, 'detail', lectureId] as const,
  reviews: (lectureId: number) =>
    [...lectureKeys.all, 'reviews', lectureId] as const,
  access: (lectureId: number, contentId: number) =>
    [...lectureKeys.all, 'access', lectureId, contentId] as const,
  mine: (page: number) => [...lectureKeys.all, 'mine', page] as const,
  sales: (page: number) => [...lectureKeys.all, 'sales', page] as const,
  inspections: (params: InspectionListParams) =>
    [...lectureKeys.all, 'inspections', params] as const,
  adminDetail: (lectureId: number) =>
    [...lectureKeys.all, 'admin-detail', lectureId] as const,
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

/**
 * 강의 검색(검색 앱). 비회원도 쓰고 1분에 60번까지다(넘으면 429, ApiError.retryAfter).
 * 다시 불러도 같은 이유로 실패하기 쉬워(검색 서버 장애 503도 호출 제한에 센다) 자동으로 다시 부르지 않는다.
 */
export const lectureSearchQuery = (params: LectureSearchParams) =>
  queryOptions({
    queryKey: lectureKeys.search(params),
    queryFn: () =>
      api<PagedModel<LectureSearchItem>>('/search/lectures', {
        query: {
          keyword: params.keyword,
          sort: searchSortOf(params.sort),
          page: params.page,
          size: LECTURE_SEARCH_PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
    retry: false,
  })

/**
 * 강의 검색어 자동완성(비회원도 씀). 후보는 최대 5개다. 본 검색과 따로 1분에 120번까지라(넘으면 429) 다시 부르지 않고,
 * 실패(429·503·연결 끊김)하면 부른 쪽이 후보만 숨긴다. 검색어는 normalizeKeyword로 정리해 빈 값이 아닐 때만 부른다.
 * 입력이 바뀌어 쓰지 않게 된 요청은 signal로 끊는다(늦게 온 응답은 그 검색어의 캐시에만 들어간다)
 */
export const lectureSuggestionsQuery = (keyword: string) =>
  queryOptions({
    queryKey: lectureKeys.suggestions(keyword),
    queryFn: ({ signal }) =>
      api<LectureSuggestion[]>('/search/lectures/suggestions', {
        query: { keyword },
        signal,
      }),
    staleTime: 60_000,
    retry: false,
  })

/**
 * 강의 썸네일 일괄 조회(1~100개). 부를 때마다 주소가 달라지고 대개 1시간 쓸 수 있다.
 * 받은 강의 ID마다 키가 있고, 판매 중이 아니거나 썸네일이 없으면 null이다.
 */
export function fetchLectureThumbnails(lectureIds: readonly number[]) {
  return api<LectureThumbnails>('/lectures/thumbnails', {
    query: { ids: lectureIds.join(',') },
  })
}

/** 한 페이지 강의의 썸네일. 같은 화면에서 다시 부르지 않게 주소가 만료되기 전까지 새로 받지 않는다 */
export const lectureThumbnailsQuery = (lectureIds: readonly number[]) =>
  queryOptions({
    queryKey: lectureKeys.thumbnails(lectureIds),
    queryFn: () => fetchLectureThumbnails(lectureIds),
    enabled: lectureIds.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 50 * 60_000,
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

/** 강의 정보 수정. 삭제하기 전이면 상태와 관계없이 고칠 수 있고 재검수 없이 바로 반영된다(204) */
export function updateLectureInfo(
  lectureId: number,
  input: LectureInfoUpdateInput,
) {
  return api<void>(`/lectures/${lectureId}`, { method: 'PATCH', body: input })
}

/** 콘텐츠 목록 전체 교체. 반려(REJECTED)된 강의만 되고 교체한 뒤에도 반려 그대로다(204). 교체하면 contentId가 새로 매겨진다 */
export function replaceLectureContents(
  lectureId: number,
  contents: LectureContentInput[],
) {
  return api<void>(`/lectures/${lectureId}/contents`, {
    method: 'PUT',
    body: { contents },
  })
}

/** 재검수 신청. 반려(REJECTED) → 검수 대기(PENDING_INSPECTION) (204) */
export function requestInspection(lectureId: number) {
  return api<void>(`/lectures/${lectureId}/inspection-requests`, {
    method: 'POST',
  })
}

// ── 관리자 검수 ──

/** 관리자 검수 목록 크기. BE 기본값과 같다. */
export const INSPECTION_PAGE_SIZE = 20

/** 상태별 검수 목록. 정렬은 BE가 검수 신청 오래된 순으로 고정한다. */
export const inspectionsQuery = (params: InspectionListParams) =>
  queryOptions({
    queryKey: lectureKeys.inspections(params),
    queryFn: () =>
      api<PagedModel<InspectionLecture>>('/lectures/admin/inspections', {
        query: {
          status: params.status,
          page: params.page,
          size: INSPECTION_PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  })

/** 관리자 상세. 검수 대기·반려·삭제한 강의도 반려 사유와 함께 본다(BE D30). */
export const adminLectureQuery = (lectureId: number) =>
  queryOptions({
    queryKey: lectureKeys.adminDetail(lectureId),
    queryFn: () => api<LectureDetail>(`/lectures/admin/${lectureId}`),
  })

/** 승인. 검수 대기 → 판매 중(204). 검수 대기가 아니면 409 NOT_PENDING_INSPECTION */
export function approveLecture(lectureId: number) {
  return api<void>(`/lectures/admin/${lectureId}/inspection/approve`, {
    method: 'POST',
  })
}

/** 반려. 검수 대기 → 반려(204). 사유는 판매자에게 그대로 보인다 */
export function rejectLecture(lectureId: number, reason: string) {
  return api<void>(`/lectures/admin/${lectureId}/inspection/reject`, {
    method: 'POST',
    body: { reason },
  })
}
