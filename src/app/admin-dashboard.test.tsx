import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  channelReviewHandlers,
  resetChannelReviewDb,
} from '@/test/channelReviewMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const API = {
  channels: '*/api/v1/members/admin/channels',
  promotions: '*/api/v1/members/admin/upgrade-requests',
  lectures: '*/api/v1/lectures/admin/inspections',
  inquiries: '*/api/v1/inquiries/admin',
  payouts: '*/api/v1/lectures/admin/payout-failures',
  exchanges: '*/api/v1/settlements/admin/exchanges',
} as const

const paged = (totalElements: number) =>
  rs({
    content: [],
    page: {
      size: 10,
      number: 0,
      totalElements,
      totalPages: Math.ceil(totalElements / 10),
    },
  })

/** 각 관리 목록 API가 page 0에 줄 전체 건수 */
function mockCounts(counts: Partial<Record<keyof typeof API, number>>) {
  server.use(
    ...Object.entries(counts).map(([key, n]) =>
      http.get(API[key as keyof typeof API], () => paged(n)),
    ),
  )
}

/** 대시보드 요약 카드. 레일 메뉴에도 같은 이름의 링크가 있어 카드 영역 안에서 찾는다 */
const cards = () => screen.findByRole('region', { name: '업무별 대기 건수' })
const card = async (label: string) =>
  within(await cards()).findByRole('link', { name: new RegExp(`^${label}`) })
const failedCard = async (label: string) =>
  within(await cards()).findByRole('group', { name: label })

/** 요청이 다음 테스트로 새지 않게 모두 끝날 때까지 기다린다 */
async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
}

afterEach(async () => {
  await settle()
  queryClient.clear()
})

describe('관리자 운영 대시보드', () => {
  it('관리자 첫 화면에서 여섯 업무의 대기 건수를 보여 준다', async () => {
    mockCounts({
      channels: 3,
      promotions: 1,
      lectures: 2,
      inquiries: 4,
      payouts: 5,
      exchanges: 6,
    })
    renderApp('/admin', 'ADMIN')

    expect(
      await screen.findByRole('heading', { level: 1, name: '운영 대시보드' }),
    ).toBeInTheDocument()
    expect(await card('채널 인증 대기')).toHaveTextContent('3건')
    expect(await card('승급 심사 대기')).toHaveTextContent('1건')
    expect(await card('강의 검수 대기')).toHaveTextContent('2건')
    expect(await card('답변 대기 문의')).toHaveTextContent('4건')
    expect(await card('지급 실패')).toHaveTextContent('5건')
    expect(await card('환전 승인 대기')).toHaveTextContent('6건')
  })

  it('대기 상태만 센다(답변 대기 문의는 오래된 순 첫 페이지)', async () => {
    const seen: string[] = []
    server.use(
      ...Object.values(API).map((path) =>
        http.get(path, ({ request }) => {
          const url = new URL(request.url)
          seen.push(`${url.pathname}?${url.searchParams}`)
          return paged(1)
        }),
      ),
    )
    renderApp('/admin', 'ADMIN')
    await waitFor(() => expect(seen).toHaveLength(6))

    const query = (path: string) => seen.find((s) => s.startsWith(path))
    expect(query('/api/v1/members/admin/channels')).toMatch(
      /status=PENDING&page=0/,
    )
    expect(query('/api/v1/members/admin/upgrade-requests')).toMatch(
      /status=PENDING&page=0/,
    )
    expect(query('/api/v1/lectures/admin/inspections')).toMatch(
      /status=PENDING_INSPECTION&page=0/,
    )
    expect(query('/api/v1/inquiries/admin')).toMatch(
      /status=WAITING&sort=OLDEST&page=0/,
    )
    expect(query('/api/v1/lectures/admin/payout-failures')).toMatch(/page=0/)
    expect(query('/api/v1/settlements/admin/exchanges')).toMatch(
      /status=REQUESTED&page=0/,
    )
  })

  it.each([
    ['채널 인증 대기', '/admin/channels'],
    ['승급 심사 대기', '/admin/promotions'],
    ['강의 검수 대기', '/admin/lectures'],
    ['답변 대기 문의', '/admin/inquiries'],
    ['지급 실패', '/admin/payouts'],
    ['환전 승인 대기', '/admin/exchanges'],
  ])('%s 카드를 누르면 %s로 간다', async (label, path) => {
    mockCounts({
      channels: 1,
      promotions: 1,
      lectures: 1,
      inquiries: 1,
      payouts: 1,
      exchanges: 1,
    })
    const router = renderApp('/admin', 'ADMIN')

    const link = await card(label)
    await waitFor(() => expect(link).toHaveTextContent('1건'))
    expect(link).toHaveAttribute('href', path)
    await userEvent.click(link)
    expect(router.state.location.pathname).toBe(path)
  })

  it('채널 카드에서 들어가면 같은 대기 목록을 본다', async () => {
    resetChannelReviewDb()
    server.use(...channelReviewHandlers)
    renderApp('/admin', 'ADMIN')

    const link = await card('채널 인증 대기')
    await waitFor(() => expect(link).toHaveTextContent('2건'))
    await userEvent.click(link)
    expect(
      await screen.findByRole('heading', { level: 1, name: '채널 인증 심사' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('listitem', {
        name: '새벽기타의 채널 인증 신청',
      }),
    ).toBeInTheDocument()
  })

  it('대기 건이 없으면 모두 처리함을 보여 주고 링크는 그대로다', async () => {
    mockCounts({ channels: 0, promotions: 2 })
    renderApp('/admin', 'ADMIN')

    const link = await card('채널 인증 대기')
    await waitFor(() => expect(link).toHaveTextContent('모두 처리함'))
    expect(link).not.toHaveTextContent('0건')
    expect(link).toHaveAttribute('href', '/admin/channels')
    expect(await card('승급 심사 대기')).toHaveTextContent('2건')
  })

  it('한 API가 실패해도 나머지 카드는 건수를 보여 준다', async () => {
    mockCounts({ channels: 3, lectures: 2, inquiries: 4, payouts: 5 })
    server.use(
      http.get(API.promotions, () =>
        HttpResponse.json(
          { status: 400, code: 'INVALID_REQUEST', detail: '잘못된 요청' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/admin', 'ADMIN')

    const failed = await failedCard('승급 심사 대기')
    expect(
      await within(failed).findByText('불러오지 못했어요'),
    ).toBeInTheDocument()
    expect(
      within(await cards()).queryByRole('link', { name: /^승급 심사 대기/ }),
    ).toBeNull()
    expect(await card('채널 인증 대기')).toHaveTextContent('3건')
    expect(await card('강의 검수 대기')).toHaveTextContent('2건')
    expect(await card('답변 대기 문의')).toHaveTextContent('4건')
    expect(await card('지급 실패')).toHaveTextContent('5건')
  })

  it('실패한 카드에서 다시 시도하면 건수를 다시 불러온다', async () => {
    let calls = 0
    server.use(
      http.get(API.promotions, () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json(
              { status: 400, code: 'INVALID_REQUEST', detail: '잘못된 요청' },
              { status: 400 },
            )
          : paged(6)
      }),
    )
    renderApp('/admin', 'ADMIN')

    const failed = await failedCard('승급 심사 대기')
    expect(
      within(failed).getByRole('link', { name: '목록 열기' }),
    ).toHaveAttribute('href', '/admin/promotions')
    await userEvent.click(
      await within(failed).findByRole('button', { name: '다시 시도' }),
    )
    expect(await card('승급 심사 대기')).toHaveTextContent('6건')
  })

  it('불러오는 동안 카드마다 불러오는 중을 표시한다', async () => {
    mockCounts({ channels: 3 })
    server.use(
      http.get(API.payouts, async () => {
        await delay(300)
        return paged(5)
      }),
    )
    renderApp('/admin', 'ADMIN')

    const channels = await card('채널 인증 대기')
    await waitFor(() => expect(channels).toHaveTextContent('3건'))
    const payouts = await card('지급 실패')
    expect(payouts).toHaveAttribute('aria-busy', 'true')
    expect(payouts).toHaveTextContent('불러오는 중…')
    await waitFor(() => expect(payouts).toHaveTextContent('5건'))
    expect(payouts).toHaveAttribute('aria-busy', 'false')
  })
})
