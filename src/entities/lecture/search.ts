import type { LectureBrowseSort, LectureSearchSort, LectureSort } from './types'

/** 검색어 최대 길이. 넘으면 서버가 400 INVALID_REQUEST라 입력 단계에서 막는다 */
export const LECTURE_KEYWORD_MAX = 50

/** 검색 결과는 앞에서 이만큼까지만 볼 수 있다((page + 1) × size가 넘으면 400 PAGE_TOO_DEEP) */
export const LECTURE_SEARCH_WINDOW = 1_000

/** 검색 한 페이지 크기. 1,000을 나누어떨어지게 해 응답의 totalPages대로 넘겨도 PAGE_TOO_DEEP이 나지 않게 한다 */
export const LECTURE_SEARCH_PAGE_SIZE = 20

/** 화면 정렬 선택지 순서 */
export const LECTURE_BROWSE_SORTS: readonly LectureBrowseSort[] = [
  'DEFAULT',
  'LATEST',
  'PRICE_ASC',
  'PRICE_DESC',
  'RATING',
]

/** 정렬 이름. DEFAULT는 검색어가 있으면 관련도순이라 이름이 바뀐다(sortLabel) */
const SORT_LABEL: Record<Exclude<LectureBrowseSort, 'DEFAULT'>, string> = {
  LATEST: '최신순',
  PRICE_ASC: '가격 낮은 순',
  PRICE_DESC: '가격 높은 순',
  RATING: '평점 높은 순',
}

export function sortLabel(sort: LectureBrowseSort, searching: boolean) {
  if (sort === 'DEFAULT') return searching ? '관련도순' : '기본'
  return SORT_LABEL[sort]
}

/** URL의 sort 값을 화면 정렬로 읽는다. 모르는 값은 기본이다 */
export function parseBrowseSort(value: string | null): LectureBrowseSort {
  return (
    LECTURE_BROWSE_SORTS.find((s) => s !== 'DEFAULT' && s === value) ??
    'DEFAULT'
  )
}

/** 강의 목록 API 값. 기본은 최신순이다 */
export function listSortOf(sort: LectureBrowseSort): LectureSort {
  return sort === 'DEFAULT' ? 'LATEST' : sort
}

const SEARCH_SORT: Record<LectureSort, LectureSearchSort> = {
  LATEST: 'latest,desc',
  PRICE_ASC: 'price,asc',
  PRICE_DESC: 'price,desc',
  RATING: 'rating,desc',
}

/** 강의 검색 API 값. 기본은 보내지 않는다(검색어가 있으면 관련도순) */
export function searchSortOf(
  sort: LectureBrowseSort,
): LectureSearchSort | undefined {
  return sort === 'DEFAULT' ? undefined : SEARCH_SORT[sort]
}

/** 서버와 같게 앞뒤·연속 공백을 정리하고 최대 길이로 자른다. 비면 빈 문자열(검색어 없음)이다 */
export function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, LECTURE_KEYWORD_MAX).trim()
}
