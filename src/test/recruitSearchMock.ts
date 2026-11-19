import { http } from 'msw'
import { isCalendarDate } from '@/entities/appearance/recruitSearch'
import type { RecruitSummary } from '@/entities/appearance/types'
import type { PagedModel } from '@/shared/api/types'
import { problem } from './emailCodeMock'
import { rs } from './renderApp'
import { server } from './server'

/**
 * 테스트 전용: 출연 모집 공개 목록(GET /appearances/recruits)의 검색 조건(BE #1020)을 BE처럼 흉내 내는 MSW 핸들러.
 * 개발 서버에서는 쓰지 않는다(실제 BE를 쓴다).
 */

/** 흉내 모집글. 검색어는 본문(content)에서도 찾으므로 목록 응답에 없는 본문을 함께 둔다 */
export type SearchRecruit = RecruitSummary & { content: string }

export const SEARCH_HOST_IDS = [9, 10] as const
/** 호스트 닉네임. 검색어는 호스트 닉네임에서도 찾는다 */
const HOST_NICKNAMES: Record<number, string> = {
  9: '밤새는곰',
  10: '편집하는 고래',
}

const recruit = (
  id: number,
  title: string,
  content: string,
  scheduledAt: string,
  recruitDeadline: string,
  feePerPerson: number,
  [selectedCount, recruitCount]: [number, number],
  createdAt: string,
): SearchRecruit => ({
  id,
  hostId: SEARCH_HOST_IDS[id % 2],
  title,
  content,
  scheduledAt,
  feePerPerson,
  recruitCount,
  selectedCount,
  applicantCount: selectedCount + 1,
  recruitDeadline,
  status: 'RECRUITING',
  createdAt,
})

/** 검색 시험 모집글 5개(방송·마감 날짜, 출연료, 남은 자리, 등록 순서를 섞었다) */
export const SEARCH_RECRUITS: SearchRecruit[] = [
  recruit(
    1,
    '주말 공포게임 합방',
    '공포 게임 3인 플레이',
    '2999-10-20T21:00:00',
    '2999-10-18T23:59:00',
    30000,
    [1, 3],
    '2026-11-10T10:00:00',
  ),
  recruit(
    2,
    '롤 내전 게스트 모집',
    '다이아 이상 환영해요',
    '2999-10-25T20:00:00',
    '2999-10-15T23:59:00',
    50000,
    [2, 2],
    '2026-11-12T10:00:00',
  ),
  recruit(
    3,
    '노래 릴레이',
    '롤 끝나고 노래 방송',
    '2999-10-22T22:00:00',
    '2999-10-21T12:00:00',
    20000,
    [0, 5],
    '2026-11-11T10:00:00',
  ),
  recruit(
    4,
    '먹방 콜라보',
    'Mukbang 같이 해요',
    '2999-11-02T19:00:00',
    '2999-10-30T23:59:00',
    80000,
    [0, 1],
    '2026-11-09T10:00:00',
  ),
  recruit(
    5,
    '토크 게스트',
    '편하게 수다',
    '2999-10-20T15:00:00',
    '2999-10-19T23:59:00',
    25000,
    [3, 3],
    '2026-11-13T10:00:00',
  ),
]

const SORTS = ['LATEST', 'SCHEDULED_SOON', 'DEADLINE_SOON', 'FEE_HIGH']

const invalid = (detail: string) => problem(400, 'INVALID_REQUEST', detail)

/** 같으면 최신순(등록 최신, id 큰 순) */
const latest = (a: SearchRecruit, b: SearchRecruit) =>
  b.createdAt.localeCompare(a.createdAt) || b.id - a.id

const ORDER: Record<string, (a: SearchRecruit, b: SearchRecruit) => number> = {
  LATEST: latest,
  SCHEDULED_SOON: (a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt) || latest(a, b),
  DEADLINE_SOON: (a, b) =>
    a.recruitDeadline.localeCompare(b.recruitDeadline) || latest(a, b),
  FEE_HIGH: (a, b) => b.feePerPerson - a.feePerPerson || latest(a, b),
}

/**
 * 공개 모집 목록 흉내. recruits를 검색어(제목·본문·호스트 닉네임, 대소문자 무시)·방송 날짜(KST 날짜, 양 끝 포함)·1인 출연료·남은 자리로
 * 거르고 정렬해 페이지로 준다. 잘못된 값(범위 뒤집힘, 음수·정수 아님, 모르는 sort, 날짜 형식, 50자 초과)은 400 INVALID_REQUEST.
 * 받은 쿼리를 차례로 남긴다
 */
export function mockRecruitSearch(recruits: SearchRecruit[] = SEARCH_RECRUITS) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('*/api/v1/appearances/recruits', ({ request }) => {
      const q = new URL(request.url).searchParams
      requests.push(q)

      const keyword = (q.get('keyword') ?? '').trim()
      if (keyword.length > 50)
        return invalid('검색어는 50자 이하로 입력해 주세요.')
      const from = q.get('scheduledFrom')
      const to = q.get('scheduledTo')
      if (
        (from !== null && !isCalendarDate(from)) ||
        (to !== null && !isCalendarDate(to))
      )
        return invalid('방송 날짜는 yyyy-MM-dd 형식이어야 합니다.')
      if (from !== null && to !== null && from > to)
        return invalid('방송 날짜 범위가 올바르지 않습니다.')
      const fees = [q.get('minFee'), q.get('maxFee')]
      if (fees.some((fee) => fee !== null && !/^\d+$/.test(fee)))
        return invalid('출연료는 0 이상의 정수여야 합니다.')
      const [minFee, maxFee] = fees.map((fee) =>
        fee === null ? null : Number(fee),
      )
      if (minFee !== null && maxFee !== null && minFee > maxFee)
        return invalid('출연료 범위가 올바르지 않습니다.')
      const sort = q.get('sort') ?? 'LATEST'
      if (!SORTS.includes(sort)) return invalid('지원하지 않는 정렬입니다.')
      const hasSeats = q.get('hasSeats') === 'true'

      const word = keyword.toLowerCase()
      const found = recruits
        .filter((r) => {
          const day = r.scheduledAt.slice(0, 10)
          return (
            (!word ||
              [r.title, r.content, HOST_NICKNAMES[r.hostId] ?? ''].some(
                (text) => text.toLowerCase().includes(word),
              )) &&
            (from === null || day >= from) &&
            (to === null || day <= to) &&
            (minFee === null || r.feePerPerson >= minFee) &&
            (maxFee === null || r.feePerPerson <= maxFee) &&
            (!hasSeats || r.selectedCount < r.recruitCount)
          )
        })
        .sort(ORDER[sort])

      const page = Number(q.get('page') ?? 0)
      const size = Number(q.get('size') ?? 10)
      const data: PagedModel<RecruitSummary> = {
        content: found
          .slice(page * size, (page + 1) * size)
          .map(({ content: _content, ...summary }) => summary),
        page: {
          size,
          number: page,
          totalElements: found.length,
          totalPages: Math.ceil(found.length / size),
        },
      }
      return rs(data)
    }),
    ...SEARCH_HOST_IDS.map((id) =>
      http.get(`*/api/v1/members/${id}`, () =>
        rs({
          id,
          nickname: HOST_NICKNAMES[id],
          role: 'INFLUENCER',
          profileImageUrl: null,
          channels: [],
        }),
      ),
    ),
  )
  return requests
}

/** 모집글 n개(페이지 넘기기 확인용). 제목은 '모집 1'부터 */
export function manyRecruits(n: number): SearchRecruit[] {
  return Array.from({ length: n }, (_, i) =>
    recruit(
      100 + i,
      `모집 ${i + 1}`,
      '본문',
      '2999-10-20T21:00:00',
      '2999-10-18T23:59:00',
      30000,
      [0, 3],
      // 앞 번호가 최신이다
      `2026-11-${String(28 - i).padStart(2, '0')}T10:00:00`,
    ),
  )
}
