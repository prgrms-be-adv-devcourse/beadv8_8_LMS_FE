import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { ISSUABLE_PAGE_SIZE } from '@/entities/coupon/api'
import { openAccountMenu } from '@/test/accountMenu'
import {
  couponProblem,
  issuableCoupon,
  mockCoupons,
  quietLectureRequests,
} from '@/test/couponMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

/**
 * 응답 순서(최신순). 모든 강의 쿠폰과 강의 쿠폰이 섞여 온다. 판매 중이 아닌 강의의 쿠폰은 BE가 이미 뺐다.
 * 강의 9 쿠폰은 강의 제목이 오지 않은 경우다
 */
const ISSUABLE = [
  issuableCoupon({
    couponId: 3,
    name: '강의 7 쿠폰',
    lectureId: 7,
    lectureTitle: '첫 방송 세팅',
  }),
  issuableCoupon({
    couponId: 1,
    name: '전 강의 쿠폰',
    targetType: 'ANY_LECTURE',
    lectureId: null,
  }),
  issuableCoupon({
    couponId: 2,
    name: '받은 전 강의 쿠폰',
    targetType: 'ANY_LECTURE',
    lectureId: null,
    issued: true,
  }),
  issuableCoupon({
    couponId: 4,
    name: '다 나간 강의 7 쿠폰',
    lectureId: 7,
    lectureTitle: '첫 방송 세팅',
    soldOut: true,
  }),
  issuableCoupon({
    couponId: 6,
    name: '강의 9 쿠폰',
    lectureId: 9,
    lectureTitle: null,
  }),
]

/** 두 쪽을 채우는 쿠폰(앞 쪽 20장, 뒤 쪽 5장). 모두 특정 강의 쿠폰이고 강의마다 한 장이다 */
const MANY = Array.from({ length: ISSUABLE_PAGE_SIZE + 5 }, (_, i) =>
  issuableCoupon({
    couponId: 101 + i,
    name: `쿠폰 ${101 + i}`,
    lectureId: 201 + i,
  }),
)

/** 쿠폰 받기 화면을 유저로 연다 */
async function openZone(
  init: Parameters<typeof mockCoupons>[0] = {},
  path = '/coupons',
) {
  const coupons = mockCoupons({ issuable: ISSUABLE, ...init })
  const router = renderApp(path, 'USER')
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

/** 화면에 보이는 쿠폰 이름(위에서부터) */
const shownCoupons = () =>
  screen
    .getAllByRole('group')
    .map((g) => g.getAttribute('aria-label'))
    .filter((name): name is string => name !== null)

/** 목록 아래 줄의 받을 수 있는 수 안내 */
const barHint = () =>
  screen.getByText(
    (_, element) =>
      element?.tagName === 'P' &&
      /받을 수 있는 쿠폰 \d+장$/.test(element.textContent ?? ''),
  )

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
  it('받을 수 있는 쿠폰 한 쪽을 불러와 모든 강의 쿠폰과 강의별 쿠폰으로 나눠 보인다', async () => {
    const { coupons } = await openZone()

    const any = await screen.findByRole('region', { name: '모든 강의 쿠폰' })
    expect(groupNames(any)).toEqual(['전 강의 쿠폰', '받은 전 강의 쿠폰'])

    const byLecture = screen.getByRole('region', { name: '강의별 쿠폰' })
    // 강의 제목은 쿠폰 응답의 lectureTitle이다(강의 상세를 따로 부르지 않는다).
    const first = within(byLecture).getByRole('group', {
      name: '첫 방송 세팅',
    })
    expect(groupNames(first)).toEqual(['강의 7 쿠폰', '다 나간 강의 7 쿠폰'])
    expect(
      within(first).getByRole('link', { name: '강의 보기' }),
    ).toHaveAttribute('href', '/lectures/7')
    // 강의 제목이 없으면 제목 없이 강의 보기만 둔다.
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
        name: / 받음$/,
      }),
    ).toBeDisabled()
    expect(
      within(await ticket('다 나간 강의 7 쿠폰')).getByRole('button', {
        name: / 소진$/,
      }),
    ).toBeDisabled()
    expect(
      within(await ticket('전 강의 쿠폰')).getByText(
        '받은 날부터 30일 · 남은 수량 60장',
      ),
    ).toBeInTheDocument()

    expect(coupons.issuablePages).toEqual([0])
    // 한 쪽뿐이면 쪽 이동을 두지 않는다.
    expect(screen.queryByRole('navigation', { name: '페이지' })).toBeNull()
    // 전에 받은 쿠폰이 있으면 쿠폰함으로 이어 주고, 받을 것이 남아 모두 받기도 둔다.
    expect(
      screen.getByRole('link', { name: '쿠폰함에서 보기' }),
    ).toHaveAttribute('href', '/library/coupons')
    expect(barHint()).toHaveTextContent(/^받을 수 있는 쿠폰 3장$/)
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
      within(card).getByRole('button', { name: / 발급받기$/ }),
    )
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: / 받음$/ })).toBeDisabled()
    expect(coupons.issueRequests.map((r) => r.couponId)).toEqual([3])
    expect(
      screen.getByRole('link', { name: '쿠폰함에서 보기' }),
    ).toHaveAttribute('href', '/library/coupons')
    await waitFor(() => expect(coupons.issuablePages).toEqual([0, 0]))
  })

  it('모두 받기는 화면 순서(모든 강의 → 강의별)대로 받을 수 있는 쿠폰만 앞 쿠폰의 결과를 본 뒤 차례로 보낸다', async () => {
    const { coupons } = await openZone({ issueStatuses: ['ISSUED'] })
    await ticket('강의 9 쿠폰')
    const log = recordIssueTraffic()

    await userEvent.click(screen.getByRole('button', { name: '모두 받기' }))
    expect(await screen.findByText('3장 받았어요')).toBeInTheDocument()
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
      expect(
        within(card).getByRole('button', { name: / 받음$/ }),
      ).toBeDisabled()
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
    await ticket('강의 9 쿠폰')

    await userEvent.click(screen.getByRole('button', { name: '모두 받기' }))
    expect(
      await screen.findByText('2장 받았어요 · 1장은 받지 못했어요'),
    ).toBeInTheDocument()
    const failed = await ticket('강의 7 쿠폰')
    expect(within(failed).getByText('모두 소진됐어요')).toBeInTheDocument()
    expect(
      within(failed).getByRole('button', { name: / 소진$/ }),
    ).toBeDisabled()
  })

  it('쪽이 여럿이면 쪽을 넘겨 끝까지 보고, 쪽 번호는 주소에 남는다', async () => {
    const { coupons, router } = await openZone({ issuable: MANY })
    const pager = await screen.findByRole('navigation', { name: '페이지' })
    expect(pager).toHaveTextContent('전체 2쪽 중 1쪽')
    expect(shownCoupons()).toHaveLength(ISSUABLE_PAGE_SIZE)
    expect(shownCoupons()[0]).toBe('쿠폰 101')
    // 모두 받기는 이 쪽만 보낸다고 밝힌다.
    expect(barHint()).toHaveTextContent(
      `이 쪽에서 받을 수 있는 쿠폰 ${ISSUABLE_PAGE_SIZE}장`,
    )

    await userEvent.click(within(pager).getByRole('button', { name: '다음' }))
    expect(await ticket('쿠폰 121')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    await waitFor(() =>
      expect(shownCoupons()).toEqual(
        MANY.slice(ISSUABLE_PAGE_SIZE).map((c) => c.name),
      ),
    )
    expect(
      screen.getByRole('navigation', { name: '페이지' }),
    ).toHaveTextContent('전체 2쪽 중 2쪽')
    expect(barHint()).toHaveTextContent('이 쪽에서 받을 수 있는 쿠폰 5장')
    expect(coupons.issuablePages).toEqual([0, 1])
    // 강의 제목은 쿠폰마다 함께 온다.
    expect(screen.getByRole('group', { name: '강의 221' })).toBeInTheDocument()
  })

  it('모두 받기는 지금 쪽에 보이는 받을 수 있는 쿠폰만 보내고, 끝날 때까지 쪽을 넘기지 않는다', async () => {
    const { coupons } = await openZone(
      {
        issuable: [
          ...MANY,
          issuableCoupon({
            couponId: 999,
            name: '뒤 쪽의 받은 쿠폰',
            targetType: 'ANY_LECTURE',
            lectureId: null,
            issued: true,
          }),
        ],
        issueStatuses: ['ISSUED'],
      },
      '/coupons?page=2',
    )
    expect(await ticket('쿠폰 121')).toBeInTheDocument()
    // 첫 접수를 붙잡아 두고 그동안 쪽 이동이 사라지는지 본다.
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post(
        '*/api/v1/coupons/:couponId/issue-requests',
        async () => {
          await gate
        },
        { once: true },
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: '모두 받기' }))
    expect(await screen.findByText('받는 중 0/5')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '페이지' })).toBeNull()
    release()

    expect(await screen.findByText('5장 받았어요')).toBeInTheDocument()
    expect(coupons.issueRequests.map((r) => r.couponId)).toEqual(
      MANY.slice(ISSUABLE_PAGE_SIZE).map((c) => c.couponId),
    )
    const pager = screen.getByRole('navigation', { name: '페이지' })

    // 앞 쪽으로 넘기면 이 쪽의 결과는 지우고 그 쪽에서 받을 수 있는 수를 보인다.
    await userEvent.click(within(pager).getByRole('button', { name: '이전' }))
    expect(await ticket('쿠폰 101')).toBeInTheDocument()
    expect(screen.queryByText('5장 받았어요')).toBeNull()
    await waitFor(() =>
      expect(barHint()).toHaveTextContent(
        `이 쪽에서 받을 수 있는 쿠폰 ${ISSUABLE_PAGE_SIZE}장`,
      ),
    )
  })

  it('주소의 쪽이 마지막 쪽을 넘으면 마지막 쪽으로 옮긴다', async () => {
    const { router } = await openZone({ issuable: MANY }, '/coupons?page=9')

    expect(await ticket('쿠폰 121')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
  })

  it('강의 정보를 확인하지 못하면(503) 빈 목록이 아니라 잠시 뒤 다시 시도하라고 안내하고 다시 불러올 수 있다', async () => {
    const { coupons } = await openZone({
      failNext: {
        'GET /coupons/issuable': couponProblem(
          503,
          'LECTURE_CATALOG_UNAVAILABLE',
          '강의 정보를 확인할 수 없습니다.',
        ),
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('지금은 쿠폰을 불러올 수 없어요')
    expect(alert).toHaveTextContent(
      '강의 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    )
    expect(screen.queryByText('지금 받을 수 있는 쿠폰이 없어요')).toBeNull()
    // 곧바로 다시 불러도 같기 쉬워 저절로 다시 부르지 않는다.
    expect(coupons.issuablePages).toEqual([0])

    await userEvent.click(
      within(alert).getByRole('button', { name: '다시 시도' }),
    )
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
    expect(coupons.issuablePages).toEqual([0, 0])
  })

  it('불러오는 중에는 뼈대를 보인다', async () => {
    mockCoupons({ issuable: ISSUABLE })
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    // mockCoupons보다 뒤에 걸어야 먼저 거친다(응답을 붙잡아 두었다가 넘긴다).
    server.use(
      http.get('*/api/v1/coupons/issuable', async () => {
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

  it('불러오지 못하면 다시 시도할 수 있다', async () => {
    await openZone({
      // 4xx는 재시도하지 않아 바로 오류 화면이 된다. 걸어 둔 오류는 한 번만 쓰인다.
      failNext: { 'GET /coupons/issuable': couponProblem(400, 'BAD_REQUEST') },
    })

    expect(await screen.findByText('불러오지 못했어요')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
  })
})

describe('쿠폰 받기로 들어오는 곳', () => {
  it('계정 메뉴의 내 활동에서 쿠폰 받기로 간다', async () => {
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
    mockCoupons({ issuable: ISSUABLE })
    const router = renderApp('/library/coupons', 'USER')
    await screen.findByRole('heading', { level: 1, name: '쿠폰함' })

    await userEvent.click(screen.getByRole('link', { name: '쿠폰 받기' }))
    expect(router.state.location.pathname).toBe('/coupons')
    expect(await ticket('전 강의 쿠폰')).toBeInTheDocument()
  })
})
