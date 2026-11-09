import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { LectureDetail } from '@/entities/lecture/types'
import {
  couponProblem,
  memberCoupon,
  mockCoupons,
  quietLectureRequests,
} from '@/test/couponMock'
import { mockOrders } from '@/test/lectureOrders'
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

/** 쿠폰함 조회의 쿼리 문자열을 모은다. 응답은 mockCoupons가 준다(이 핸들러는 기록만 하고 넘긴다). */
function recordMyCouponRequests() {
  const seen: string[] = []
  server.use(
    http.get('*/api/v1/coupons/me', ({ request }) => {
      seen.push(new URL(request.url).search)
    }),
  )
  return seen
}

const item = (name: string) => screen.findByRole('listitem', { name })

beforeEach(quietLectureRequests)

afterEach(() => queryClient.clear())

describe('쿠폰함', () => {
  it('사용 가능 쿠폰을 기본으로 불러와 이름·대상 강의·할인·만료일·상태를 보여 준다', async () => {
    mockCoupons({
      mine: [
        memberCoupon({
          memberCouponId: 1,
          couponName: '가을맞이 10% 할인',
          targetType: 'LECTURE',
          lectureId: 7,
          discountType: 'RATE',
          discountValue: 10,
          maxDiscountAmount: null,
          expiresAt: '2026-11-30T14:00:00Z',
        }),
        memberCoupon({
          memberCouponId: 2,
          couponId: 2,
          couponName: '전 강의 15% 할인',
          targetType: 'ANY_LECTURE',
          lectureId: null,
          discountType: 'RATE',
          discountValue: 15,
          maxDiscountAmount: 5000,
          stackable: true,
          expiresAt: '2026-12-08T01:00:00Z',
        }),
        memberCoupon({
          memberCouponId: 3,
          couponId: 3,
          couponName: '3천 HP 할인',
          targetType: 'LECTURE',
          lectureId: 8,
          discountType: 'AMOUNT',
          discountValue: 3000,
        }),
      ],
    })
    const seen = recordMyCouponRequests()
    server.use(
      http.get('*/api/v1/lectures/7', () => rs(lecture)),
      // 강의를 못 불러오면 '특정 강의'로 둔다.
      http.get('*/api/v1/lectures/8', () =>
        HttpResponse.json(
          { status: 404, code: 'LECTURE_NOT_FOUND', detail: '강의가 없어요' },
          { status: 404 },
        ),
      ),
    )
    renderApp('/library/coupons', 'USER')

    expect(
      await screen.findByRole('heading', { level: 1, name: '쿠폰함' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사용 가능' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const lectureCoupon = await item('가을맞이 10% 할인')
    expect(
      await within(lectureCoupon).findByRole('link', { name: '첫 방송 세팅' }),
    ).toHaveAttribute('href', '/lectures/7')
    expect(lectureCoupon).toHaveTextContent('10% 할인')
    expect(lectureCoupon).toHaveTextContent('11/30(월)까지')
    expect(within(lectureCoupon).getByText('사용 가능')).toHaveClass(
      'pill',
      'ok',
    )
    expect(
      within(lectureCoupon).queryByText('다른 쿠폰과 함께 사용 가능'),
    ).toBeNull()

    const anyCoupon = await item('전 강의 15% 할인')
    expect(anyCoupon).toHaveTextContent('모든 강의')
    expect(anyCoupon).toHaveTextContent('15% 할인 · 최대 5,000 HP')
    expect(anyCoupon).toHaveTextContent('12/8(화)까지')
    expect(
      within(anyCoupon).getByText('다른 쿠폰과 함께 사용 가능'),
    ).toBeInTheDocument()

    const amountCoupon = await item('3천 HP 할인')
    expect(amountCoupon).toHaveTextContent('3,000 HP 할인')
    expect(
      await within(amountCoupon).findByRole('link', { name: '특정 강의' }),
    ).toHaveAttribute('href', '/lectures/8')

    expect(seen).toEqual(['?status=AVAILABLE'])
  })

  it('상태 필터를 바꾸면 URL과 요청이 바뀌고, 모르는 값은 사용 가능으로 본다', async () => {
    mockCoupons({
      mine: [
        memberCoupon({ memberCouponId: 1, couponName: '쓸 수 있는 쿠폰' }),
        memberCoupon({
          memberCouponId: 2,
          couponName: '다 쓴 쿠폰',
          status: 'USED',
        }),
        memberCoupon({
          memberCouponId: 3,
          couponName: '지난 쿠폰',
          status: 'EXPIRED',
        }),
      ],
    })
    const seen = recordMyCouponRequests()
    server.use(http.get('*/api/v1/lectures/7', () => rs(lecture)))
    const user = userEvent.setup()
    const router = renderApp('/library/coupons?status=WRONG', 'USER')

    expect(await item('쓸 수 있는 쿠폰')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사용 가능' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '사용 완료' }))
    const used = await item('다 쓴 쿠폰')
    expect(within(used).getByText('사용 완료')).toHaveClass('pill', 'mute')
    expect(
      screen.queryByRole('listitem', { name: '쓸 수 있는 쿠폰' }),
    ).toBeNull()
    expect(router.state.location.search).toBe('?status=USED')
    expect(screen.getByRole('button', { name: '사용 완료' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '만료' }))
    expect(await item('지난 쿠폰')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=EXPIRED')

    // 기본값으로 돌아가면 URL에서 빼고, 오래된 목록이라 다시 불러온다.
    // 캐시의 목록이 먼저 보이고 다시 부르는 요청은 그 뒤에 나가므로, 화면이 아니라 요청 기록을 기다린다.
    await user.click(screen.getByRole('button', { name: '사용 가능' }))
    expect(await item('쓸 수 있는 쿠폰')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')

    await waitFor(() =>
      expect(seen).toEqual([
        '?status=AVAILABLE',
        '?status=USED',
        '?status=EXPIRED',
        '?status=AVAILABLE',
      ]),
    )
  })

  it('받은 쿠폰이 없으면 빈 안내와 강의 둘러보기를 보여 준다', async () => {
    mockCoupons()
    renderApp('/library/coupons', 'INFLUENCER')

    expect(
      await screen.findByText('지금 쓸 수 있는 쿠폰이 없어요'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '강의 둘러보기' })).toHaveAttribute(
      'href',
      '/lectures',
    )
  })

  it('사용 중 쿠폰이 없으면 그 상태의 빈 안내를 보여 준다', async () => {
    mockCoupons({ mine: [memberCoupon()] })
    renderApp('/library/coupons?status=RESERVED', 'USER')

    expect(
      await screen.findByText('주문에 쓰고 있는 쿠폰이 없어요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '강의 둘러보기' })).toBeNull()
  })

  it('쿠폰함을 불러오지 못하면 다시 시도할 수 있다', async () => {
    const state = mockCoupons({ mine: [memberCoupon()] })
    // 4xx는 재시도하지 않아 바로 오류 화면이 된다. 걸어 둔 오류는 한 번만 쓰인다.
    state.failNext['GET /coupons/me'] = couponProblem(400, 'BAD_REQUEST')
    server.use(http.get('*/api/v1/lectures/7', () => rs(lecture)))
    const user = userEvent.setup()
    renderApp('/library/coupons', 'USER')

    expect(await screen.findByText('불러오지 못했어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await item('가을맞이 10% 할인')).toBeInTheDocument()
  })

  it('쿠폰함 메뉴는 회원에게만 보인다', async () => {
    mockCoupons()
    renderApp('/library/coupons', 'USER')
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByRole('link', { name: '쿠폰함' })).toHaveAttribute(
      'href',
      '/library/coupons',
    )
  })

  it.each([
    ['/library/coupons', 'USER', '쿠폰함', '내 강의'],
    ['/studio/coupons', 'VERIFIED_INFLUENCER', '쿠폰 신청', '강의 판매'],
  ] as const)(
    '%s에서는 하위 메뉴만 켜지고 상위 메뉴는 꺼진다',
    async (path, viewer, child, parent) => {
      mockCoupons()
      renderApp(path, viewer)
      const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
      expect(within(nav).getByRole('link', { name: child })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(
        within(nav).getByRole('link', { name: parent }),
      ).not.toHaveAttribute('aria-current')
    },
  )

  it('상위 메뉴의 다른 하위 경로에서는 상위 메뉴가 켜진다', async () => {
    mockOrders()
    renderApp('/library/orders', 'USER')
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByRole('link', { name: '내 강의' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: '쿠폰함' }),
    ).not.toHaveAttribute('aria-current')
  })

  it.each(['GUEST', 'ADMIN'] as const)(
    '%s에게는 쿠폰함 메뉴가 없다',
    async (viewer) => {
      renderApp('/', viewer)
      const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
      expect(within(nav).queryByRole('link', { name: '쿠폰함' })).toBeNull()
    },
  )
})
