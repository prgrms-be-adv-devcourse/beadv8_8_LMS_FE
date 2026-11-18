/** 검색어 최대 길이 (BE 출연 모집 공개 목록) */
export const RECRUIT_KEYWORD_MAX = 50
/** 출연료 칸에 받을 최대 자릿수(9억 HP 미만). 실제 출연료보다 훨씬 커서 조건으로는 충분하다 */
export const RECRUIT_FEE_MAX_DIGITS = 9

/**
 * 공개 모집 목록 정렬. 같으면 최신순이다
 * - LATEST: 등록 최신순(기본)
 * - SCHEDULED_SOON: 방송 일시 빠른 순
 * - DEADLINE_SOON: 모집 마감 빠른 순
 * - FEE_HIGH: 1인 출연료 높은 순
 */
export type RecruitSort =
  'LATEST' | 'SCHEDULED_SOON' | 'DEADLINE_SOON' | 'FEE_HIGH'

export const RECRUIT_SORTS: readonly [RecruitSort, string][] = [
  ['LATEST', '최신순'],
  ['SCHEDULED_SOON', '방송 임박순'],
  ['DEADLINE_SOON', '마감 임박순'],
  ['FEE_HIGH', '출연료 높은 순'],
]

/** 공개 모집 목록의 검색 조건. 값이 없으면 그 조건을 걸지 않는다 */
export type RecruitSearch = {
  /** 제목·본문 부분 일치. 빈 문자열이면 검색어 없음 */
  keyword: string
  /** 방송 날짜 범위(yyyy-MM-dd, KST, 양 끝 포함) */
  scheduledFrom?: string
  scheduledTo?: string
  /** 1인 출연료 범위(HP) */
  minFee?: number
  maxFee?: number
  /** 남은 자리가 있는 글만 */
  hasSeats: boolean
  sort: RecruitSort
}

export const NO_RECRUIT_SEARCH: RecruitSearch = {
  keyword: '',
  hasSeats: false,
  sort: 'LATEST',
}

/** 검색어를 BE처럼 앞뒤 공백을 지우고 최대 길이로 자른다 */
export const normalizeRecruitKeyword = (value: string) =>
  value.trim().slice(0, RECRUIT_KEYWORD_MAX).trim()

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** 있는 날짜(yyyy-MM-dd)인지. 2026-02-30 같은 값은 버린다 */
const isDate = (value: string) =>
  DATE.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

const dateOf = (raw: string | null) =>
  raw !== null && isDate(raw) ? raw : undefined

const feeOf = (raw: string | null) =>
  raw !== null && new RegExp(`^\\d{1,${RECRUIT_FEE_MAX_DIGITS}}$`).test(raw)
    ? Number(raw)
    : undefined

const sortOf = (raw: string | null): RecruitSort =>
  RECRUIT_SORTS.find(([value]) => value === raw)?.[0] ?? 'LATEST'

/**
 * URL 쿼리(?keyword=&scheduledFrom=&scheduledTo=&minFee=&maxFee=&hasSeats=true&sort=)를 조건으로 읽는다.
 * 형식이 맞지 않는 값(직접 고친 주소)은 그 조건만 버린다. 범위가 뒤집힌 주소는 그대로 보내 BE 400 안내를 보인다
 */
export function parseRecruitSearch(params: URLSearchParams): RecruitSearch {
  return {
    keyword: normalizeRecruitKeyword(params.get('keyword') ?? ''),
    scheduledFrom: dateOf(params.get('scheduledFrom')),
    scheduledTo: dateOf(params.get('scheduledTo')),
    minFee: feeOf(params.get('minFee')),
    maxFee: feeOf(params.get('maxFee')),
    hasSeats: params.get('hasSeats') === 'true',
    sort: sortOf(params.get('sort')),
  }
}

/** 조건을 URL 쿼리로. 기본값은 빼고, 페이지는 첫 페이지로 돌린다(page를 넣지 않는다) */
export function recruitSearchToParams(search: RecruitSearch): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(recruitSearchQuery(search)))
    if (value !== undefined) params.set(key, String(value))
  return params
}

/** 목록 API에 보낼 조건. 기본값(정렬 LATEST, 남은 자리 조건 없음)은 싣지 않는다 */
export function recruitSearchQuery(search: RecruitSearch) {
  return {
    keyword: search.keyword || undefined,
    scheduledFrom: search.scheduledFrom,
    scheduledTo: search.scheduledTo,
    minFee: search.minFee,
    maxFee: search.maxFee,
    hasSeats: search.hasSeats || undefined,
    sort: search.sort === 'LATEST' ? undefined : search.sort,
  }
}

/** 두 조건이 같은지(같으면 주소를 바꾸지 않는다) */
export const sameRecruitSearch = (a: RecruitSearch, b: RecruitSearch) =>
  recruitSearchToParams(a).toString() === recruitSearchToParams(b).toString()

/** 정렬을 뺀 조건(검색어·날짜·출연료·남은 자리)이 하나라도 걸렸는지 */
export const hasRecruitConditions = (search: RecruitSearch) =>
  !sameRecruitSearch(search, { ...NO_RECRUIT_SEARCH, sort: search.sort })
