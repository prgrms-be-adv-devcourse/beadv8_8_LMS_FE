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
import { openAccountMenu } from '@/test/accountMenu'
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

/** 화면 요청이 모두 끝날 때까지 기다린다(메뉴만 보는 테스트가 끝난 뒤 요청이 다음 테스트로 넘어가지 않게) */
const settled = () => waitFor(() => expect(queryClient.isFetching()).toBe(0))

beforeEach(quietLectureRequests)

afterEach(() => queryClient.clear())

describe('쿠폰함', () => {
  it('모두 한 번에 불러와 사용 가능 쿠폰을 기본으로 보이고, 쿠폰마다 쓸 수 있는 강의로 가는 길을 둔다', async () => {
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
          expiresAt: '2999-11-30T14:00:00Z',
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
          expiresAt: '2999-12-08T01:00:00Z',
        }),
        memberCoupon({
          memberCouponId: 3,
          couponId: 3,
          couponName: '3천 HP 할인',
          targetType: 'LECTURE',
          lectureId: 8,
          discountType: 'AMOUNT',
          discountValue: 3000,
          expiresAt: '2999-12-31T01:00:00Z',
        }),
        memberCoupon({
          memberCouponId: 4,
          couponId: 4,
          couponName: '다 쓴 쿠폰',
          status: 'USED',
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
    const lectureCoupon = await item('가을맞이 10% 할인')
    expect(screen.getByRole('button', { name: '사용 가능' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByRole('listitem', { name: '다 쓴 쿠폰' })).toBeNull()

    // 특정 강의 쿠폰: 강의 제목과 그 강의 상세로 가는 길
    expect(await within(lectureCoupon).findByText('첫 방송 세팅')).toBeVisible()
    expect(
      within(lectureCoupon).getByRole('link', { name: '강의 보기' }),
    ).toHaveAttribute('href', '/lectures/7')
    expect(lectureCoupon).toHaveTextContent('10% 할인')
    expect(lectureCoupon).toHaveTextContent(/11\/30\(.\)까지/)
    expect(within(lectureCoupon).getByText('사용 가능')).toHaveClass(
      'pill',
      'ok',
    )
    expect(
      within(lectureCoupon).queryByText('다른 쿠폰과 함께 사용 가능'),
    ).toBeNull()

    // 모든 강의 쿠폰: 강의 목록으로 가는 길
    const anyCoupon = await item('전 강의 15% 할인')
    expect(anyCoupon).toHaveTextContent('모든 강의')
    expect(anyCoupon).toHaveTextContent('15% 할인 · 최대 5,000 HP')
    expect(
      within(anyCoupon).getByText('다른 쿠폰과 함께 사용 가능'),
    ).toBeInTheDocument()
    expect(
      within(anyCoupon).getByRole('link', { name: '강의 둘러보기' }),
    ).toHaveAttribute('href', '/lectures')

    const amountCoupon = await item('3천 HP 할인')
    expect(amountCoupon).toHaveTextContent('3,000 HP 할인')
    expect(amountCoupon).toHaveTextContent('특정 강의')
    expect(
      within(amountCoupon).getByRole('link', { name: '강의 보기' }),
    ).toHaveAttribute('href', '/lectures/8')

    expect(seen).toEqual([''])
  })

  it('위에 사용 가능·곧 만료 수를 보이고, 쓸 수 있는 쿠폰은 만료가 가까운 순으로 놓는다', async () => {
    const inDays = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString()
    mockCoupons({
      mine: [
        memberCoupon({
          memberCouponId: 1,
          couponName: '넉넉한 쿠폰',
          expiresAt: inDays(20),
        }),
        memberCoupon({
          memberCouponId: 2,
          couponName: '곧 끝나는 쿠폰',
          expiresAt: inDays(2),
        }),
        memberCoupon({
          memberCouponId: 3,
          couponName: '주문에 쓰는 쿠폰',
          status: 'RESERVED',
          expiresAt: inDays(1),
        }),
        memberCoupon({
          memberCouponId: 4,
          couponName: '만료된 쿠폰',
          status: 'EXPIRED',
          expiresAt: inDays(-3),
        }),
      ],
    })
    server.use(http.get('*/api/v1/lectures/7', () => rs(lecture)))
    renderApp('/library/coupons', 'USER')

    const summary = await screen.findByLabelText('쿠폰 요약')
    expect(summary).toHaveTextContent('사용 가능2장')
    expect(summary).toHaveTextContent('곧 만료1장')

    const list = await screen.findByRole('list', { name: '쿠폰 목록' })
    const names = within(list)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label'))
    // 주문에 묶인 쿠폰은 사용 가능 보기에 두되 쓸 수 있는 쿠폰 뒤에 둔다.
    expect(names).toEqual(['곧 끝나는 쿠폰', '넉넉한 쿠폰', '주문에 쓰는 쿠폰'])
    const soon = within(list).getByRole('listitem', { name: '곧 끝나는 쿠폰' })
    expect(soon).toHaveTextContent('D-2 곧 만료돼요')
    const reserved = within(list).getByRole('listitem', {
      name: '주문에 쓰는 쿠폰',
    })
    expect(within(reserved).getByText('사용 중')).toHaveClass('pill', 'warn')
    // 주문에 쓰는 중인 쿠폰은 쓰러 가는 길을 두지 않는다.
    expect(within(reserved).queryByRole('link')).toBeNull()
  })

  it('지난 쿠폰(사용·만료)으로 나눠 보고 URL에 남기며, 모르는 값은 사용 가능으로 본다', async () => {
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
    const router = renderApp('/library/coupons?view=WRONG', 'USER')

    expect(await item('쓸 수 있는 쿠폰')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사용 가능' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '지난 쿠폰' }))
    const used = await item('다 쓴 쿠폰')
    expect(within(used).getByText('사용 완료')).toHaveClass('pill', 'mute')
    expect(within(used).queryByRole('link')).toBeNull()
    const expired = await item('지난 쿠폰')
    expect(within(expired).getByText('만료')).toHaveClass('pill', 'mute')
    expect(
      screen.queryByRole('listitem', { name: '쓸 수 있는 쿠폰' }),
    ).toBeNull()
    expect(router.state.location.search).toBe('?view=past')
    expect(screen.getByRole('button', { name: '지난 쿠폰' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // 기본값으로 돌아가면 URL에서 뺀다. 보기만 바꾸므로 다시 부르지 않는다.
    await user.click(screen.getByRole('button', { name: '사용 가능' }))
    expect(await item('쓸 수 있는 쿠폰')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    await settled()
    expect(seen.every((search) => search === '')).toBe(true)
  })

  it('BE 만료 배치 전이라 아직 사용 가능 상태여도 기한이 지난 쿠폰은 만료로 보이고 세지 않는다', async () => {
    mockCoupons({
      mine: [
        memberCoupon({
          memberCouponId: 1,
          couponName: '쓸 수 있는 쿠폰',
          expiresAt: '2999-11-30T14:00:00Z',
        }),
        // 기한은 지났지만 BE 배치(10분 간격)가 아직 EXPIRED로 바꾸지 않은 쿠폰
        memberCoupon({
          memberCouponId: 2,
          couponId: 2,
          couponName: '기한 지난 쿠폰',
          expiresAt: '2020-01-01T00:00:00Z',
        }),
      ],
    })
    const user = userEvent.setup()
    renderApp('/library/coupons', 'USER')

    expect(await item('쓸 수 있는 쿠폰')).toBeInTheDocument()
    expect(screen.getByLabelText('쿠폰 요약')).toHaveTextContent('사용 가능1장')
    expect(
      screen.queryByRole('listitem', { name: '기한 지난 쿠폰' }),
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: '지난 쿠폰' }))
    const lapsed = await item('기한 지난 쿠폰')
    expect(within(lapsed).getByText('만료')).toHaveClass('pill', 'mute')
    expect(within(lapsed).queryByRole('link')).toBeNull()
  })

  it('받은 쿠폰이 없으면 쿠폰 받기로 보낸다', async () => {
    mockCoupons()
    renderApp('/library/coupons', 'INFLUENCER')

    expect(
      await screen.findByText('쓸 수 있는 쿠폰이 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('받을 수 있는 쿠폰은 쿠폰 받기에 모여 있어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '쿠폰 받으러 가기' }),
    ).toHaveAttribute('href', '/coupons')
    // 머리에도 쿠폰 받기가 늘 있다.
    expect(screen.getByRole('link', { name: '쿠폰 받기' })).toHaveAttribute(
      'href',
      '/coupons',
    )
    expect(screen.getByLabelText('쿠폰 요약')).toHaveTextContent('사용 가능0장')
  })

  it('지난 쿠폰이 없으면 그 보기의 빈 안내만 보인다', async () => {
    mockCoupons({ mine: [memberCoupon()] })
    server.use(http.get('*/api/v1/lectures/7', () => rs(lecture)))
    renderApp('/library/coupons?view=past', 'USER')

    expect(await screen.findByText('지난 쿠폰이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '쿠폰 받으러 가기' })).toBeNull()
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
    const nav = await openAccountMenu()
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
      const nav = await openAccountMenu()
      expect(within(nav).getByRole('link', { name: child })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(
        within(nav).getByRole('link', { name: parent }),
      ).not.toHaveAttribute('aria-current')
      await settled()
    },
  )

  it('상위 메뉴의 다른 하위 경로에서는 상위 메뉴가 켜진다', async () => {
    mockOrders()
    renderApp('/library/orders', 'USER')
    const nav = await openAccountMenu()
    expect(within(nav).getByRole('link', { name: '내 강의' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: '쿠폰함' }),
    ).not.toHaveAttribute('aria-current')
    await settled()
  })

  it('비회원에게는 쿠폰함 메뉴가 없다', async () => {
    renderApp('/', 'GUEST')
    await screen.findByRole('navigation', { name: '둘러보기' })
    expect(screen.queryByRole('link', { name: '쿠폰함' })).toBeNull()
  })

  it('관리자 레일에는 쿠폰함 메뉴가 없다', async () => {
    renderApp('/', 'ADMIN')
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).queryByRole('link', { name: '쿠폰함' })).toBeNull()
  })
})
