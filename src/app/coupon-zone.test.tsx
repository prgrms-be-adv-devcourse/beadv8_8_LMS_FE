import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { LectureDetail } from '@/entities/lecture/types'
import { openAccountMenu } from '@/test/accountMenu'
import {
  couponProblem,
  couponSummary,
  mockCoupons,
  quietLectureRequests,
} from '@/test/couponMock'
import { LECTURE_LOOKUP_CONCURRENCY } from '@/pages/coupon-zone/useLectureLookups'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const lecture: LectureDetail = {
  lectureId: 7,
  sellerUserId: 99,
  sellerNickname: '하루',
  title: '첫 방송 세팅',
  description: '장비부터 OBS까지',
  priceHp: 30000,
  thumbnailUrl: null,
  thumbnailFileId: null,
  status: 'ON_SALE',
  rejectionReason: null,
  deleted: false,
  averageRating: null,
  reviewCount: 0,
  contents: [],
  createdAt: '2026-10-01T01:00:00Z',
}

/** 응답 순서(최신순). 모든 강의 쿠폰과 강의 쿠폰이 섞여 온다 */
const ISSUABLE = [
  couponSummary({ couponId: 3, name: '강의 7 쿠폰', lectureId: 7 }),
  couponSummary({
    couponId: 1,
    name: '전 강의 쿠폰',
    targetType: 'ANY_LECTURE',
    lectureId: null,
  }),
  couponSummary({ couponId: 5, name: '강의 8 쿠폰', lectureId: 8 }),
  couponSummary({
    couponId: 2,
    name: '받은 전 강의 쿠폰',
    targetType: 'ANY_LECTURE',
    lectureId: null,
    issued: true,
  }),
  couponSummary({
    couponId: 4,
    name: '다 나간 강의 7 쿠폰',
    lectureId: 7,
    soldOut: true,
  }),
  couponSummary({ couponId: 6, name: '강의 9 쿠폰', lectureId: 9 }),
  couponSummary({ couponId: 7, name: '검수 중 강의 쿠폰', lectureId: 10 }),
]

/**
 * 강의 7은 제목을 주고, 강의 8은 없다(404, 판매가 끝났거나 지운 강의). 강의 9는 그 밖의 이유로 못 불러온다
 * (4xx라 다시 시도하지 않는다). 강의 10은 있지만 판매 중이 아니다(검수 중)
 */
function mockLectures() {
  server.use(
    http.get('*/api/v1/lectures/7', () => rs(lecture)),
    http.get('*/api/v1/lectures/8', () =>
      HttpResponse.json(
        { status: 404, code: 'LECTURE_NOT_FOUND', detail: '강의가 없어요' },
        { status: 404 },
      ),
    ),
    http.get('*/api/v1/lectures/9', () =>
      HttpResponse.json(
        { status: 400, code: 'BAD_REQUEST', detail: '잘못된 요청' },
        { status: 400 },
      ),
    ),
    http.get('*/api/v1/lectures/10', () =>
      rs({
        ...lecture,
        lectureId: 10,
        title: '검수 중 강의',
        status: 'PENDING_INSPECTION',
      }),
    ),
  )
}

/**
 * 강의 조회가 끝나 강의별 쿠폰이 모두 자리를 잡을 때까지(강의 9의 쿠폰이 보이고, 없는 강의 8·판매 중이 아닌 강의 10의
 * 쿠폰은 빠진다)
 */
async function lecturesSettled() {
  await ticket('강의 9 쿠폰')
  await waitFor(() => {
    expect(screen.queryByRole('group', { name: '강의 8 쿠폰' })).toBeNull()
    expect(
      screen.queryByRole('group', { name: '검수 중 강의 쿠폰' }),
    ).toBeNull()
  })
}

/** 쿠폰 받기 화면을 유저로 연다 */
async function openZone(init: Parameters<typeof mockCoupons>[0] = {}) {
  mockLectures()
  const coupons = mockCoupons({ issuable: ISSUABLE, ...init })
  const router = renderApp('/coupons', 'USER')
  expect(
    await screen.findByRole('heading', { level: 1, name: '쿠폰 받기' }),
  ).toBeInTheDocument()
  return { coupons, router }
}

const ticket = (name: string) => screen.findByRole('group', { name })

const groupNames = (container: HTMLElement) =>
  within(container)
    .getAllByRole('group')
    .map((g) => g.getAttribute('aria-label'))

/** 발급 접수(POST)와 상태 조회(GET)를 일어난 순서대로 적는다. 응답은 mockCoupons가 준다(그보다 뒤에 부른다) */
function recordIssueTraffic() {
  const log: string[] = []
  server.use(
    http.post('*/api/v1/coupons/:couponId/issue-requests', ({ params }) => {
      log.push(`접수 ${String(params.couponId)}`)
    }),
    http.get('*/api/v1/coupons/:couponId/issue-requests/:id', ({ params }) => {
      log.push(`조회 ${String(params.couponId)}`)
    }),
  )
  return log
}

beforeEach(quietLectureRequests)

afterEach(() => {
  // 발급 상태 조회가 그려진 채 캐시가 비면 다시 그릴 때 조회를 새로 보내므로 화면부터 내린다.
  cleanup()
  queryClient.clear()
})

describe('쿠폰 받기 화면', () => {
  it('강의 없이 받을 수 있는 쿠폰 전체를 불러와 모든 강의 쿠폰과 강의별 쿠폰으로 나눠 보인다', async () => {
    const { coupons } = await openZone()

    const any = await screen.findByRole('region', { name: '모든 강의 쿠폰' })
    expect(groupNames(any)).toEqual(['전 강의 쿠폰', '받은 전 강의 쿠폰'])

    const byLecture = screen.getByRole('region', { name: '강의별 쿠폰' })
    // 강의 제목은 쿠폰 응답에 없어 강의를 불러와 보인다.
    const first = await within(byLecture).findByRole('group', {
      name: '첫 방송 세팅',
    })
    expect(groupNames(first)).toEqual(['강의 7 쿠폰', '다 나간 강의 7 쿠폰'])
    expect(
      within(first).getByRole('link', { name: '강의 보기' }),
    ).toHaveAttribute('href', '/lectures/7')
    // 없는 강의(404)·판매 중이 아닌 강의의 쿠폰은 받아도 쓸 곳이 없어 빼고, 그 밖의 이유로 못 불러온 강의는 제목 없이
    // 강의 보기만 둔다.
    await lecturesSettled()
    expect(
      within(byLecture)
        .getAllByRole('link', { name: '강의 보기' })
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/lectures/7', '/lectures/9'])
    expect(
      within(byLecture)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['첫 방송 세팅'])

    // 이미 받은 쿠폰과 다 나간 쿠폰은 막는다.
    expect(
      within(await ticket('받은 전 강의 쿠폰')).getByRole('button', {
        name: '받음',
      }),
    ).toBeDisabled()
    expect(
      within(await ticket('다 나간 강의 7 쿠폰')).getByRole('button', {
        name: '소진',
      }),
    ).toBeDisabled()
    expect(
      within(await ticket('전 강의 쿠폰')).getByText(
        '받은 날부터 30일 · 남은 수량 60장',
      ),
    ).toBeInTheDocument()

    expect(coupons.issuableCalls).toBe(1)
    // 전에 받은 쿠폰이 있으면 쿠폰함으로 이어 주고, 받을 것이 남아 모두 받기도 둔다.
    expect(
      screen.getByRole('link', { name: '쿠폰함에서 보기' }),
    ).toHaveAttribute('href', '/library/coupons')
    expect(screen.getByRole('button', { name: '모두 받기' })).toBeEnabled()
  })

  it('쿠폰 한 장을 받으면 발급 완료를 보이고 쿠폰함에서 보기가 생기며 목록을 다시 불러온다', async () => {
    const { coupons } = await openZone({
      // 전에 받은 쿠폰이 없을 때
      issuable: ISSUABLE.filter((c) => !c.issued),
      issueStatuses: ['ISSUED'],
    })
    const card = await ticket('강의 7 쿠폰')
    expect(screen.queryByRole('link', { name: '쿠폰함에서 보기' })).toBeNull()

    await userEvent.click(
      within(card).getByRole('button', { name: '발급받기' }),
    )
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: '받음' })).toBeDisabled()
    expect(coupons.issueRequests.map((r) => r.couponId)).toEqual([3])
    expect(
      screen.getByRole('link', { name: '쿠폰함에서 보기' }),
    ).toHaveAttribute('href', '/library/coupons')
    await waitFor(() => expect(coupons.issuableCalls).toBe(2))
  })

  it('모두 받기는 화면 순서(모든 강의 → 강의별)대로 보이는 쿠폰 중 받을 수 있는 것만 앞 쿠폰의 결과를 본 뒤 차례로 보낸다', async () => {
    const { coupons } = await openZone({ issueStatuses: ['ISSUED'] })
    await lecturesSettled()
    const log = recordIssueTraffic()

    await userEvent.click(screen.getByRole('button', { name: '모두 받기' }))
    expect(await screen.findByText('3장 받았어요')).toBeInTheDocument()
    // 없는 강의(8)·판매 중이 아닌 강의(10)의 쿠폰은 보내지 않는다.
    expect(coupons.issueRequests.map((r) => r.couponId)).toEqual([1, 3, 6])
    expect(log).toEqual([
      '접수 1',
      '조회 1',
      '접수 3',
      '조회 3',
      '접수 6',
      '조회 6',
    ])
    for (const name of ['전 강의 쿠폰', '강의 7 쿠폰', '강의 9 쿠폰']) {
      const card = await ticket(name)
      expect(within(card).getByRole('button', { name: '받음' })).toBeDisabled()
    }

    // 받을 것이 남지 않으면 모두 받기 대신 쿠폰함으로 이어 준다.
    expect(screen.queryByRole('button', { name: '모두 받기' })).toBeNull()
    expect(
      screen.getByRole('link', { name: '쿠폰함에서 보기' }),
    ).toHaveAttribute('href', '/library/coupons')
  })

  it('모두 받기 중 일부가 실패하면 그 쿠폰에 표시하고 나머지를 계속 받는다', async () => {
    await openZone({
      issueStatuses: ['ISSUED'],
      failNext: {
        'POST /coupons/3/issue-requests': couponProblem(409, 'COUPON_SOLD_OUT'),
      },
    })
    await lecturesSettled()

    await userEvent.click(screen.getByRole('button', { name: '모두 받기' }))
    expect(
      await screen.findByText('2장 받았어요 · 1장은 받지 못했어요'),
    ).toBeInTheDocument()
    const failed = await ticket('강의 7 쿠폰')
    expect(within(failed).getByText('모두 소진됐어요')).toBeInTheDocument()
    expect(within(failed).getByRole('button', { name: '소진' })).toBeDisabled()
  })

  it(`강의 상세는 한 번에 ${LECTURE_LOOKUP_CONCURRENCY}개까지만 부르고, 하나가 끝나면 다음 강의를 부른다`, async () => {
    const lectureIds = Array.from(
      { length: LECTURE_LOOKUP_CONCURRENCY + 2 },
      (_, i) => 101 + i,
    )
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const requested: number[] = []
    let inFlight = 0
    let maxInFlight = 0
    server.use(
      http.get('*/api/v1/lectures/:lectureId', async ({ params }) => {
        const lectureId = Number(params.lectureId)
        if (!lectureIds.includes(lectureId)) return
        requested.push(lectureId)
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await gate
        inFlight--
        return rs({ ...lecture, lectureId, title: `강의 ${lectureId}` })
      }),
    )
    await openZone({
      issuable: lectureIds.map((lectureId) =>
        couponSummary({
          couponId: lectureId,
          name: `쿠폰 ${lectureId}`,
          lectureId,
        }),
      ),
    })

    // 화면 순서대로 앞의 강의부터 부른다(요청이 닿는 순서는 정해지지 않아 모아 본다).
    await waitFor(() =>
      expect([...requested].sort()).toEqual(
        lectureIds.slice(0, LECTURE_LOOKUP_CONCURRENCY),
      ),
    )
    release()
    for (const lectureId of lectureIds)
      expect(
        await screen.findByRole('group', { name: `강의 ${lectureId}` }),
      ).toBeInTheDocument()
    expect([...requested].sort()).toEqual(lectureIds)
    expect(maxInFlight).toBe(LECTURE_LOOKUP_CONCURRENCY)
  })

  it('불러오는 중에는 뼈대를 보인다', async () => {
    mockLectures()
    mockCoupons({ issuable: ISSUABLE })
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    // mockCoupons보다 뒤에 걸어야 먼저 거친다(응답을 붙잡아 두었다가 넘긴다).
    server.use(
      http.get('*/api/v1/coupons', async () => {
        await gate
      }),
    )
    renderApp('/coupons', 'USER')

    expect(await screen.findByText('불러오는 중…')).toBeInTheDocument()
    release()
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
    expect(screen.queryByText('불러오는 중…')).toBeNull()
  })

  it('받을 수 있는 쿠폰이 없으면 안내하고 강의로 보낸다', async () => {
    await openZone({ issuable: [] })

    expect(
      await screen.findByText('지금 받을 수 있는 쿠폰이 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '강의 보러 가기' }),
    ).toHaveAttribute('href', '/lectures')
    expect(screen.queryByRole('button', { name: '모두 받기' })).toBeNull()
  })

  it('받을 수 있는 쿠폰이 모두 없거나 판매 중이 아닌 강의의 쿠폰이면 빈 안내를 보인다', async () => {
    await openZone({
      issuable: ISSUABLE.filter((c) => c.lectureId === 8 || c.lectureId === 10),
    })

    expect(
      await screen.findByText('지금 받을 수 있는 쿠폰이 없어요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '강의 8 쿠폰' })).toBeNull()
  })

  it('불러오지 못하면 다시 시도할 수 있다', async () => {
    await openZone({
      // 4xx는 재시도하지 않아 바로 오류 화면이 된다. 걸어 둔 오류는 한 번만 쓰인다.
      failNext: { 'GET /coupons': couponProblem(400, 'BAD_REQUEST') },
    })

    expect(await screen.findByText('불러오지 못했어요')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
  })
})

describe('쿠폰 받기로 들어오는 곳', () => {
  it('계정 메뉴의 내 활동에서 쿠폰 받기로 간다', async () => {
    mockLectures()
    mockCoupons({ issuable: ISSUABLE })
    const router = renderApp('/lectures', 'USER')
    const nav = await openAccountMenu()

    await userEvent.click(within(nav).getByRole('link', { name: '쿠폰 받기' }))
    expect(router.state.location.pathname).toBe('/coupons')
    expect(
      await screen.findByRole('heading', { level: 1, name: '쿠폰 받기' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('쿠폰 받기 · 합방'))
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
  })

  it('쿠폰함 머리에서 쿠폰 받기로 간다', async () => {
    mockLectures()
    mockCoupons({ issuable: ISSUABLE })
    const router = renderApp('/library/coupons', 'USER')
    await screen.findByRole('heading', { level: 1, name: '쿠폰함' })

    await userEvent.click(screen.getByRole('link', { name: '쿠폰 받기' }))
    expect(router.state.location.pathname).toBe('/coupons')
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
  })
})
