import { http, HttpResponse } from 'msw'
import type { LectureSearchItem } from '@/entities/lecture/types'
import { server } from './server'

/** 검색 문서 한 개. 소개·콘텐츠 제목은 검색 응답에 없고 강조 조각으로만 나온다. ID가 클수록 최근에 등록한 강의다 */
type SearchDoc = Omit<LectureSearchItem, 'highlights'> & {
  description: string
  contentTitles: string[]
}

const doc = (
  lectureId: number,
  title: string,
  priceHp: number | null,
  averageRating: number | null,
  reviewCount: number,
  extra: Partial<SearchDoc> = {},
): SearchDoc => ({
  lectureId,
  title,
  priceHp,
  sellerUserId: 100 + (lectureId % 3),
  sellerNickname: ['편집장', '하루', '배그고수'][lectureId % 3],
  averageRating,
  reviewCount,
  description: `${title}을(를) 차근차근 알려 드려요.`,
  contentTitles: ['1강 시작하기', '2강 따라 하기'],
  ...extra,
})

/**
 * 시험 강의 24개. 가격·평점·리뷰 수가 다양하고, 리뷰 없음·가격 모름(priceHp null)·판매자 닉네임 모름이 하나씩 있다.
 * '프리미어'는 제목(11, 12)·콘텐츠 제목(13)·소개(14)에, '편집장'은 판매자 닉네임에 걸린다.
 */
export const SEARCH_DOCS: SearchDoc[] = [
  doc(1, '첫 방송 세팅', 12000, 4.2, 8),
  doc(2, '마이크 고르기', 9000, 3.9, 4),
  doc(3, 'OBS 장면 전환', 15000, null, 0),
  doc(4, '썸네일 잘 만들기', 18000, 4.8, 30),
  doc(5, '방송 대본 쓰기', 7000, 4.0, 2),
  doc(6, '배틀그라운드 실황 해설', 22000, 4.6, 15),
  doc(7, '공포게임 리액션', 11000, 3.5, 6),
  doc(8, '토크 방송 진행', 13000, 4.4, 9),
  doc(9, '후원 알림 꾸미기', 8000, 4.1, 3),
  doc(10, '라이브 하이라이트 편집', 26000, 4.7, 21),
  doc(11, '프리미어 컷편집 입문', 30000, 4.5, 12, {
    description:
      '처음 쓰는 분도 프리미어로 브이로그를 "빠르게" 만들 수 있게\n단축키부터 알려 드려요.',
    contentTitles: ['1강 설치', '2강 프리미어 화면 구성'],
  }),
  doc(12, '프리미어 자막 & 효과', 25000, 5.0, 1),
  doc(13, '브이로그 편집 루틴', 20000, 4.3, 7, {
    contentTitles: ['1강 촬영 준비', '3강 프리미어 내보내기'],
  }),
  doc(14, '컬러 보정 기초', 19000, 3.8, 5, {
    description: '프리미어 Lumetri로 R&D 하듯 색을 맞춰요.',
  }),
  doc(15, '숏폼 세로 편집', null, 4.0, 4),
  doc(16, '방송 장비 가이드', 16000, 4.9, 40, { sellerNickname: null }),
  doc(17, '채팅 관리 요령', 6000, null, 0),
  doc(18, '스트리머 브랜딩', 28000, 4.2, 11),
  doc(19, '롤 라인전 강의', 21000, 4.5, 18),
  doc(20, '리그 오브 레전드 운영', 24000, 4.6, 13),
  doc(21, '노래 방송 음향', 17000, 3.7, 3),
  doc(22, '그림 방송 세팅', 14000, 4.0, 6),
  doc(23, '합방 매너', 5000, 4.9, 2),
  doc(24, '수익 정산 이해하기', 10000, 4.3, 10),
]

const SORTS = ['latest,desc', 'rating,desc', 'price,asc', 'price,desc']

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** 서버처럼 원문을 escape하고 걸린 말만 <em>으로 감싼다. 걸리지 않으면 null */
function highlight(text: string | null, keyword: string): string | null {
  if (!text || !text.toLowerCase().includes(keyword.toLowerCase())) return null
  const at = text.toLowerCase().indexOf(keyword.toLowerCase())
  return (
    escapeHtml(text.slice(0, at)) +
    `<em>${escapeHtml(text.slice(at, at + keyword.length))}</em>` +
    escapeHtml(text.slice(at + keyword.length))
  )
}

function toItem(d: SearchDoc, keyword: string | null): LectureSearchItem {
  const { description, contentTitles, ...item } = d
  return {
    ...item,
    highlights: keyword
      ? {
          title: highlight(d.title, keyword),
          sellerNickname: highlight(d.sellerNickname, keyword),
          description: highlight(description, keyword),
          contentTitles: contentTitles
            .map((t) => highlight(t, keyword))
            .filter((t): t is string => t !== null),
        }
      : null,
  }
}

/** 관련도: 제목 > 콘텐츠 제목·판매자 닉네임 > 소개 */
function relevance(d: SearchDoc, keyword: string) {
  const has = (text: string | null) =>
    !!text && text.toLowerCase().includes(keyword.toLowerCase())
  if (has(d.title)) return 3
  if (has(d.sellerNickname) || d.contentTitles.some(has)) return 2
  return has(d.description) ? 1 : 0
}

function sortDocs(
  docs: SearchDoc[],
  sort: string | null,
  keyword: string | null,
) {
  const latest = (a: SearchDoc, b: SearchDoc) => b.lectureId - a.lectureId
  // 가격을 모르는 강의는 오름·내림 모두 맨 뒤, 같은 가격끼리는 최신순
  const byPrice = (dir: 1 | -1) => (a: SearchDoc, b: SearchDoc) => {
    if (a.priceHp === null || b.priceHp === null)
      return a.priceHp === b.priceHp
        ? latest(a, b)
        : a.priceHp === null
          ? 1
          : -1
    return (a.priceHp - b.priceHp) * dir || latest(a, b)
  }
  // 리뷰가 적으면 전체 평균(4.0) 쪽으로 보정한다
  const adjusted = (d: SearchDoc) =>
    ((d.averageRating ?? 0) * d.reviewCount + 4.0 * 5) / (d.reviewCount + 5)
  const compare =
    sort === 'price,asc'
      ? byPrice(1)
      : sort === 'price,desc'
        ? byPrice(-1)
        : sort === 'rating,desc'
          ? (a: SearchDoc, b: SearchDoc) => adjusted(b) - adjusted(a)
          : sort === null && keyword
            ? (a: SearchDoc, b: SearchDoc) =>
                relevance(b, keyword) - relevance(a, keyword) ||
                (b.averageRating ?? 0) - (a.averageRating ?? 0)
            : latest
  return [...docs].sort(compare)
}

const problem = (
  status: number,
  code: string,
  detail: string,
  headers: Record<string, string> = {},
) =>
  HttpResponse.json(
    { status, code, detail },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', ...headers },
    },
  )

export type SearchFailure = 'TOO_MANY_REQUESTS' | 'SEARCH_UNAVAILABLE'

/** 썸네일이 없는 강의(일괄 조회에서 null) */
export const NO_THUMBNAIL_IDS = [12, 14]
/** 처음에는 깨진 주소를, 다시 받으면 정상 주소를 주는 강의 */
export const BROKEN_FIRST_ID = 11

export const thumbnailUrl = (lectureId: number, attempt = 1) =>
  `https://thumbs.test/lecture-${lectureId}-${attempt}.png`

/**
 * 강의 검색(GET /search/lectures)과 썸네일 일괄 조회(GET /lectures/thumbnails) 흉내.
 * 검색은 검색어로 걸러 정렬을 흉내 내고, 허용 밖 정렬은 400 UNSUPPORTED_SORT, (page+1)×size가 1,000을 넘으면
 * 400 PAGE_TOO_DEEP이다. fail(…)로 429(Retry-After)·503을 몇 번 줄지 정한다.
 * 받은 요청의 쿼리를 searches·thumbnails에 모은다.
 */
export function mockLectureSearch({
  docs = SEARCH_DOCS,
  retryAfter = '5',
}: { docs?: SearchDoc[]; retryAfter?: string } = {}) {
  const searches: URLSearchParams[] = []
  const thumbnails: string[] = []
  const thumbnailAttempts = new Map<number, number>()
  let failure: { code: SearchFailure; times: number } | null = null

  server.use(
    http.get('*/api/v1/search/lectures', ({ request }) => {
      const params = new URL(request.url).searchParams
      searches.push(params)
      if (failure && failure.times > 0) {
        failure.times -= 1
        return failure.code === 'TOO_MANY_REQUESTS'
          ? problem(429, 'TOO_MANY_REQUESTS', '요청이 너무 많습니다.', {
              'Retry-After': retryAfter,
            })
          : problem(503, 'SEARCH_UNAVAILABLE', '지금은 검색할 수 없습니다.')
      }
      const sort = params.get('sort')
      if (sort !== null && !SORTS.includes(sort)) {
        return problem(400, 'UNSUPPORTED_SORT', '지원하지 않는 정렬입니다.')
      }
      const page = Number(params.get('page') ?? 0)
      const size = Math.min(Number(params.get('size') ?? 20), 100)
      if ((page + 1) * size > 1000) {
        return problem(400, 'PAGE_TOO_DEEP', '검색 결과는 앞에서 1,000건까지만')
      }
      const keyword = params.get('keyword')?.trim().replace(/\s+/g, ' ') || null
      const hits = keyword
        ? docs.filter((d) => relevance(d, keyword) > 0)
        : docs
      const sorted = sortDocs(hits, sort, keyword)
      const total = Math.min(sorted.length, 1000)
      return HttpResponse.json({
        statusCode: 200,
        message: '강의를 검색했습니다.',
        data: {
          content: sorted
            .slice(page * size, page * size + size)
            .map((d) => toItem(d, keyword)),
          page: {
            size,
            number: page,
            totalElements: total,
            totalPages: Math.ceil(total / size),
          },
        },
      })
    }),
    http.get('*/api/v1/lectures/thumbnails', ({ request }) => {
      const ids = new URL(request.url).searchParams.get('ids') ?? ''
      thumbnails.push(ids)
      const data: Record<string, string | null> = {}
      for (const id of ids.split(',').map(Number)) {
        const attempt = (thumbnailAttempts.get(id) ?? 0) + 1
        thumbnailAttempts.set(id, attempt)
        data[id] = NO_THUMBNAIL_IDS.includes(id)
          ? null
          : thumbnailUrl(id, attempt)
      }
      return HttpResponse.json({
        statusCode: 200,
        message: '강의 썸네일 URL을 조회했습니다.',
        data,
      })
    }),
  )

  return {
    searches,
    thumbnails,
    /** 다음 검색 요청 times번을 이 오류로 거절한다 */
    fail(code: SearchFailure, times = 1) {
      failure = { code, times }
    },
  }
}
