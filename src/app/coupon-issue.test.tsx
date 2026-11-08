import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { couponKeys } from '@/entities/coupon/api'
import type { CouponSummary } from '@/entities/coupon/types'
import type { LectureDetail } from '@/entities/lecture/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { couponProblem, couponSummary, mockCoupons } from '@/test/couponMock'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const detail: LectureDetail = {
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
  createdAt: '2026-10-01T10:00:00',
}

const emptyPage = {
  content: [],
  page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
}

const ISSUE_KEY = 'POST /coupons/1/issue-requests'

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

function mockLectureDetail() {
  server.use(
    http.get('*/api/v1/lectures/7', () => rs(detail)),
    http.get('*/api/v1/lectures/cart', () =>
      rs({ items: [], purchasableTotalHp: 0 }),
    ),
    http.get('*/api/v1/lectures/7/reviews', () => rs(emptyPage)),
  )
}

/** 강의 7 상세를 유저로 열고, 쿠폰 카드(쿠폰 이름으로 찾은 묶음)를 돌려준다 */
async function openLecture(
  init: Parameters<typeof mockCoupons>[0] = {},
  name = '가을맞이 10% 할인',
) {
  mockLectureDetail()
  const coupons = mockCoupons({
    lectureCoupons: { 7: [couponSummary()] },
    ...init,
  })
  renderApp('/lectures/7', 'USER')
  const card = await screen.findByRole('group', { name })
  return { coupons, card }
}

const issueButton = (card: HTMLElement) =>
  within(card).getByRole('button', { name: '발급받기' })

afterEach(() => {
  vi.useRealTimers()
  queryClient.clear()
  closeLoginModal()
})

describe('강의 상세 쿠폰 발급', () => {
  it('쿠폰 이름·할인·만료 방식·남은 수량을 보이고, 접수 → 처리 중 → 발급 완료로 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { coupons, card } = await openLecture({
      issueStatuses: ['PENDING', 'ISSUED'],
    })
    expect(
      screen.getByRole('heading', { name: '받을 수 있는 쿠폰' }),
    ).toBeInTheDocument()
    expect(within(card).getByText('10% 할인')).toBeInTheDocument()
    expect(
      within(card).getByText('받은 날부터 30일 · 남은 수량 60장'),
    ).toBeInTheDocument()

    await userEvent.click(issueButton(card))
    expect(await within(card).findByRole('status')).toHaveTextContent(
      '처리 중…',
    )
    expect(issueButton(card)).toBeDisabled()

    await advance(1_000)
    await waitFor(() =>
      expect(within(card).getByRole('status')).toHaveTextContent(
        /^발급 완료 · .+까지 쓸 수 있어요$/,
      ),
    )
    expect(within(card).getByRole('button', { name: '받음' })).toBeDisabled()
    expect(coupons.issueRequests).toHaveLength(1)
    expect(coupons.issueRequests[0].issueRequestId).toMatch(
      /^[A-Za-z0-9_-]{1,64}$/,
    )
  })

  it('응답을 받지 못해 다시 누르면 같은 요청 ID로 보낸다', async () => {
    const { coupons, card } = await openLecture({
      issueStatuses: ['ISSUED'],
      failNext: { [ISSUE_KEY]: HttpResponse.error() },
    })

    await userEvent.click(issueButton(card))
    expect(
      await within(card).findByText('요청을 보내지 못했어요. 다시 눌러 주세요'),
    ).toBeInTheDocument()

    await userEvent.click(issueButton(card))
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(coupons.issueRequests).toHaveLength(2)
    expect(coupons.issueRequests[1].issueRequestId).toBe(
      coupons.issueRequests[0].issueRequestId,
    )
  })

  it('503이면 잠시 뒤 다시 하라고 하고, 다시 누르면 같은 요청 ID로 보낸다', async () => {
    const { coupons, card } = await openLecture({
      issueStatuses: ['ISSUED'],
      failNext: {
        [ISSUE_KEY]: couponProblem(503, 'COUPON_ISSUE_STORE_UNAVAILABLE'),
      },
    })

    await userEvent.click(issueButton(card))
    expect(
      await within(card).findByText('잠시 후 다시 시도해 주세요'),
    ).toBeInTheDocument()
    await userEvent.click(issueButton(card))
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(
      new Set(coupons.issueRequests.map((r) => r.issueRequestId)).size,
    ).toBe(1)
  })

  it('소진(409)이면 BE 문구가 아니라 코드에 맞는 문구를 보이고 버튼을 막는다', async () => {
    const { coupons, card } = await openLecture({
      failNext: {
        [ISSUE_KEY]: couponProblem(409, 'COUPON_SOLD_OUT', 'BE가 쓴 문구'),
      },
    })

    await userEvent.click(issueButton(card))
    expect(await within(card).findByText('모두 소진됐어요')).toBeInTheDocument()
    expect(screen.queryByText('BE가 쓴 문구')).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: '소진' })).toBeDisabled()
    // 처음 보낸 요청의 소진은 그대로 믿고 상태를 묻지 않는다.
    expect(coupons.statusCalls).toBe(0)
  })

  it('소진·이미 받은 쿠폰은 처음부터 막아 둔다', async () => {
    mockLectureDetail()
    mockCoupons({
      lectureCoupons: {
        7: [
          couponSummary({ couponId: 1, name: '다 나간 쿠폰', soldOut: true }),
          couponSummary({
            couponId: 2,
            name: '받은 쿠폰',
            issued: true,
            stackable: true,
          }),
        ],
      },
    })
    renderApp('/lectures/7', 'USER')

    const soldOut = await screen.findByRole('group', { name: '다 나간 쿠폰' })
    expect(within(soldOut).getByRole('button', { name: '소진' })).toBeDisabled()
    const issued = screen.getByRole('group', { name: '받은 쿠폰' })
    expect(within(issued).getByRole('button', { name: '받음' })).toBeDisabled()
    expect(within(issued).getByText('중복 사용 가능')).toBeInTheDocument()
  })

  it('10번 봐도 처리 중이면 쿠폰함에서 확인하라고 하고, 다시 누르면 같은 ID로 접수해 다시 본다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { coupons, card } = await openLecture()

    await userEvent.click(issueButton(card))
    for (let i = 0; i < 10; i++) await advance(1_000)
    expect(
      await within(card).findByText(
        '처리 중입니다. 잠시 후 쿠폰함에서 확인해 주세요',
      ),
    ).toBeInTheDocument()
    expect(coupons.statusCalls).toBe(10)
    await advance(3_000)
    expect(coupons.statusCalls).toBe(10)

    coupons.issueStatuses = ['ISSUED']
    await userEvent.click(issueButton(card))
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(coupons.issueRequests).toHaveLength(2)
    expect(coupons.issueRequests[1].issueRequestId).toBe(
      coupons.issueRequests[0].issueRequestId,
    )
  })

  it('요청 ID가 겹치면(409 ISSUE_REQUEST_ID_CONFLICT) 새 ID로 한 번만 다시 보낸다', async () => {
    const { coupons, card } = await openLecture({
      issueStatuses: ['ISSUED'],
      failNext: {
        [ISSUE_KEY]: couponProblem(409, 'ISSUE_REQUEST_ID_CONFLICT'),
      },
    })

    await userEvent.click(issueButton(card))
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(coupons.issueRequests).toHaveLength(2)
    expect(coupons.issueRequests[1].issueRequestId).not.toBe(
      coupons.issueRequests[0].issueRequestId,
    )
  })

  it('상태 조회가 10번 모두 실패해도 처리 중으로 끝내고, 다시 누르면 같은 ID로 접수해 다시 본다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { coupons, card } = await openLecture()
    let lookups = 0
    let broken = true
    server.use(
      http.get('*/api/v1/coupons/1/issue-requests/:id', ({ params }) => {
        lookups++
        return broken
          ? couponProblem(500, 'INTERNAL_ERROR')
          : rs({ issueRequestId: params.id, couponId: 1, status: 'ISSUED' })
      }),
    )

    await userEvent.click(issueButton(card))
    for (let i = 0; i < 10; i++) await advance(1_000)
    expect(
      await within(card).findByText(
        '처리 중입니다. 잠시 후 쿠폰함에서 확인해 주세요',
      ),
    ).toBeInTheDocument()
    expect(lookups).toBe(10)
    await advance(3_000)
    expect(lookups).toBe(10)
    expect(issueButton(card)).toBeEnabled()

    broken = false
    await userEvent.click(issueButton(card))
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(coupons.issueRequests).toHaveLength(2)
    expect(coupons.issueRequests[1].issueRequestId).toBe(
      coupons.issueRequests[0].issueRequestId,
    )
  })

  it('응답을 놓친 쿠폰은 목록이 받음으로 바뀌어도 같은 ID로 다시 보낼 수 있다', async () => {
    const first = couponSummary({ couponId: 1, name: '쿠폰 A' })
    const second = couponSummary({ couponId: 2, name: '쿠폰 B' })
    const { coupons, card } = await openLecture(
      {
        lectureCoupons: { 7: [first, second] },
        issueStatuses: ['ISSUED'],
        failNext: { [ISSUE_KEY]: HttpResponse.error() },
      },
      '쿠폰 A',
    )
    let listCalls = 0
    server.use(
      http.get('*/api/v1/coupons', () => {
        listCalls++
        return rs(coupons.lectureCoupons[7])
      }),
    )

    await userEvent.click(issueButton(card))
    expect(
      await within(card).findByText('요청을 보내지 못했어요. 다시 눌러 주세요'),
    ).toBeInTheDocument()

    // A는 BE에서 접수만 된 채 목록에 받음으로 나온다. B를 받으면 목록을 다시 불러온다.
    coupons.lectureCoupons[7] = [{ ...first, issued: true }, second]
    const other = screen.getByRole('group', { name: '쿠폰 B' })
    await userEvent.click(issueButton(other))
    expect(await within(other).findByText(/^발급 완료/)).toBeInTheDocument()
    await waitFor(() => expect(listCalls).toBeGreaterThan(0))
    await waitFor(() =>
      expect(
        queryClient.getQueryData<CouponSummary[]>(couponKeys.forLecture(7))?.[0]
          .issued,
      ).toBe(true),
    )

    expect(issueButton(card)).toBeEnabled()
    await userEvent.click(issueButton(card))
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    const sentForA = coupons.issueRequests.filter((r) => r.couponId === 1)
    expect(sentForA).toHaveLength(2)
    expect(sentForA[1].issueRequestId).toBe(sentForA[0].issueRequestId)
  })

  it('같은 ID로 다시 보낸 요청이 소진이면 상태를 한 번 보고, 접수돼 있으면 이어서 기다린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { coupons, card } = await openLecture({
      issueStatuses: ['PENDING', 'ISSUED'],
      failNext: { [ISSUE_KEY]: HttpResponse.error() },
    })

    await userEvent.click(issueButton(card))
    await within(card).findByText('요청을 보내지 못했어요. 다시 눌러 주세요')

    coupons.failNext[ISSUE_KEY] = couponProblem(409, 'COUPON_SOLD_OUT')
    await userEvent.click(issueButton(card))
    expect(await within(card).findByText('처리 중…')).toBeInTheDocument()
    expect(coupons.statusCalls).toBe(1)

    await advance(1_000)
    expect(await within(card).findByText(/^발급 완료/)).toBeInTheDocument()
    expect(coupons.statusCalls).toBe(2)
    expect(screen.queryByText('모두 소진됐어요')).not.toBeInTheDocument()
  })

  it('같은 ID로 다시 보낸 요청이 소진이고 접수 기록도 없으면 소진으로 끝낸다', async () => {
    const { coupons, card } = await openLecture({
      issueStatuses: ['NOT_FOUND'],
      failNext: { [ISSUE_KEY]: HttpResponse.error() },
    })

    await userEvent.click(issueButton(card))
    await within(card).findByText('요청을 보내지 못했어요. 다시 눌러 주세요')

    coupons.failNext[ISSUE_KEY] = couponProblem(409, 'COUPON_SOLD_OUT')
    await userEvent.click(issueButton(card))
    expect(await within(card).findByText('모두 소진됐어요')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: '소진' })).toBeDisabled()
    expect(coupons.statusCalls).toBe(1)
  })

  it('모르는 발급 상태가 오면 확인할 수 없다고 하고 다시 누를 수 있게 한다', async () => {
    const { card } = await openLecture()
    server.use(
      http.get('*/api/v1/coupons/1/issue-requests/:id', ({ params }) =>
        rs({ issueRequestId: params.id, couponId: 1, status: 'SOMETHING_NEW' }),
      ),
    )

    await userEvent.click(issueButton(card))
    expect(
      await within(card).findByText(
        '확인할 수 없습니다. 잠시 후 다시 시도해 주세요',
      ),
    ).toBeInTheDocument()
    expect(issueButton(card)).toBeEnabled()
  })

  it('발급되지 않으면 사유와 함께 알리고 다시 누르지 않게 한다', async () => {
    const { card } = await openLecture({
      issueStatuses: ['REJECTED'],
      issueRejectReason: '발급 한도를 넘었어요',
    })

    await userEvent.click(issueButton(card))
    expect(
      await within(card).findByText(
        '발급되지 않았습니다. 발급 한도를 넘었어요',
      ),
    ).toBeInTheDocument()
    expect(issueButton(card)).toBeDisabled()
  })

  it('쿠폰을 불러오지 못하면 쿠폰 영역만 숨기고 강의는 그대로 보인다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      lectureCoupons: { 7: [couponSummary()] },
      failNext: { 'GET /coupons': couponProblem(404, 'LECTURE_NOT_FOUND') },
    })
    renderApp('/lectures/7', 'USER')

    expect(
      await screen.findByRole('heading', { name: '첫 방송 세팅' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(coupons.failNext['GET /coupons']).toBeUndefined(),
    )
    await act(() => Promise.resolve())
    expect(
      screen.queryByRole('heading', { name: '받을 수 있는 쿠폰' }),
    ).not.toBeInTheDocument()
  })

  // 비회원은 강의 상세에 들어오지 못한다(라우트 권한). 관리자와 판매자 본인은 이 강의를 사지 않으므로 쿠폰도 받지 않는다.
  it.each([
    ['관리자', 'ADMIN', 99],
    ['판매자 본인', 'VERIFIED_INFLUENCER', ME_ID],
  ] as const)(
    '%s에게는 쿠폰 영역을 보이지 않고 쿠폰을 부르지도 않는다',
    async (_, viewer, sellerUserId) => {
      mockLectureDetail()
      let couponCalls = 0
      server.use(
        http.get('*/api/v1/lectures/7', () => rs({ ...detail, sellerUserId })),
        http.get('*/api/v1/coupons', () => {
          couponCalls++
          return rs([couponSummary()])
        }),
      )
      renderApp('/lectures/7', viewer)

      expect(
        await screen.findByRole('heading', { name: '첫 방송 세팅' }),
      ).toBeInTheDocument()
      await act(() => Promise.resolve())
      expect(
        screen.queryByRole('heading', { name: '받을 수 있는 쿠폰' }),
      ).not.toBeInTheDocument()
      expect(couponCalls).toBe(0)
    },
  )
})
