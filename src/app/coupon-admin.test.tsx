import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  resetCouponRetries,
  useCouponRetryStore,
} from '@/features/coupon-admin/retryStore'
import {
  coupon,
  couponProblem,
  mockCoupons,
  quietLectureRequests,
} from '@/test/couponMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

beforeEach(quietLectureRequests)

afterEach(() => {
  server.events.removeAllListeners('request:start')
  queryClient.clear()
  resetCouponRetries()
})

/**
 * BE가 상태(OPEN)를 먼저 저장한 뒤 발급 저장소 갱신에서 503으로 실패하는 경우를 흉내 낸다.
 * 처음 요청은 상태만 OPEN으로 바꾸고 503(또는 first가 준 응답), 같은 요청을 다시 보내면 마무리되어 성공한다.
 */
function failAfterCommit(
  state: ReturnType<typeof mockCoupons>,
  couponId: number,
  action: string,
  first: () => Response = () =>
    couponProblem(503, 'COUPON_ISSUE_STORE_UNAVAILABLE'),
) {
  let calls = 0
  server.use(
    http.post(`*/api/v1/coupons/admin/${couponId}/${action}`, () => {
      calls++
      state.actions.push(`${action} ${couponId}`)
      const target = state.admin.find((c) => c.couponId === couponId)!
      target.status = 'OPEN'
      return calls === 1 ? first() : rs(target)
    }),
  )
}

/** 판매자가 심사를 요청한 쿠폰. 흉내 BE가 상태를 바꾸므로 테스트마다 새로 만든다 */
const review = () =>
  coupon({
    couponId: 3,
    name: '가을맞이 10% 할인',
    status: 'REVIEW',
  })

/** 관리자 쿠폰 목록 요청의 검색어 */
function watchListRequests() {
  const seen: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/v1/coupons/admin')
      seen.push(url.search)
  })
  return seen
}

const item = (name: string) =>
  screen.findByRole('listitem', { name: `${name} 쿠폰` })

/** 상세 머리의 상태 배지 */
const statusPill = () =>
  document.querySelector('.page-head .pill') as HTMLElement | null

describe('관리자 쿠폰 운영', () => {
  it('처음에는 심사 중 쿠폰만 불러와 보여 준다', async () => {
    const seen = watchListRequests()
    mockCoupons({
      admin: [
        review(),
        coupon({ couponId: 4, name: '발급 중 쿠폰', status: 'OPEN' }),
      ],
    })
    renderApp('/admin/coupons', 'ADMIN')

    const row = await item('가을맞이 10% 할인')
    expect(within(row).getByText('심사 중')).toBeInTheDocument()
    expect(within(row).getByText('판매자 쿠폰')).toBeInTheDocument()
    expect(
      within(row).getByText(/강의 #7 · 10% 할인 · 발급 0\/100장/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: '발급 중 쿠폰 쿠폰' })).toBe(
      null,
    )
    expect(screen.getByRole('button', { name: '심사 중' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(seen).toEqual(['?status=REVIEW'])
  })

  it('상태 필터를 바꾸면 URL ?status=에 두고 그 상태로 다시 부른다', async () => {
    const seen = watchListRequests()
    mockCoupons({
      admin: [coupon({ couponId: 4, name: '발급 중 쿠폰', status: 'OPEN' })],
    })
    const router = renderApp('/admin/coupons', 'ADMIN')
    expect(await screen.findByText('심사할 쿠폰이 없어요')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '발급 중' }))
    expect(router.state.location.search).toBe('?status=OPEN')
    expect(await item('발급 중 쿠폰')).toBeInTheDocument()
    expect(seen).toEqual(['?status=REVIEW', '?status=OPEN'])
  })

  it('승인하면 발급 중이 되고 심사 목록에서 빠진다', async () => {
    const state = mockCoupons({ admin: [review()] })
    renderApp('/admin/coupons', 'ADMIN')

    const row = await item('가을맞이 10% 할인')
    await userEvent.click(within(row).getByRole('button', { name: '승인' }))

    expect(await screen.findByText('심사할 쿠폰이 없어요')).toBeInTheDocument()
    expect(state.actions).toEqual(['approve 3'])
    expect(state.admin[0].status).toBe('OPEN')
    expect(
      screen.getByText('승인했어요. 지금부터 발급돼요.'),
    ).toBeInTheDocument()
  })

  it('반려는 사유(1~500자)를 적어 보내고 반려 목록에 사유가 보인다', async () => {
    const state = mockCoupons({ admin: [review()] })
    renderApp('/admin/coupons', 'ADMIN')

    const row = await item('가을맞이 10% 할인')
    await userEvent.click(within(row).getByRole('button', { name: '반려' }))
    const dialog = await screen.findByRole('dialog', {
      name: '쿠폰을 반려할까요?',
    })
    const confirm = within(dialog).getByRole('button', { name: '반려' })
    expect(confirm).toBeDisabled()

    const reason = within(dialog).getByLabelText('반려 사유')
    expect(reason).toHaveAttribute('maxLength', '500')
    // maxLength를 넘는 값(붙여넣기 등)이 들어와도 보내지 않는다.
    fireEvent.change(reason, { target: { value: '가'.repeat(501) } })
    expect(
      within(dialog).getByText('반려 사유는 500자까지 쓸 수 있어요.'),
    ).toBeInTheDocument()
    expect(confirm).toBeDisabled()
    fireEvent.change(reason, { target: { value: '가'.repeat(500) } })
    expect(confirm).toBeEnabled()

    fireEvent.change(reason, { target: { value: '' } })
    await userEvent.type(reason, '  할인율이 너무 높아요  ')
    await userEvent.click(confirm)

    await waitFor(() =>
      expect(state.rejectReasons).toEqual(['할인율이 너무 높아요']),
    )
    expect(await screen.findByText('심사할 쿠폰이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '반려' }))
    const rejected = await item('가을맞이 10% 할인')
    expect(
      within(rejected).getByText('반려 사유: 할인율이 너무 높아요'),
    ).toBeInTheDocument()
    expect(within(rejected).queryByRole('button')).toBeNull()
  })

  it('모든 강의 정률 쿠폰은 최대 할인 HP가 있어야 만들고, 만든 쿠폰을 열면 발급 중이 된다', async () => {
    const state = mockCoupons()
    const router = renderApp('/admin/coupons', 'ADMIN')

    await userEvent.click(
      await screen.findByRole('button', { name: '플랫폼 쿠폰 만들기' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '플랫폼 쿠폰 만들기',
    })
    await userEvent.type(
      within(dialog).getByLabelText('쿠폰 이름'),
      '겨울 맞이 10%',
    )
    // 대상은 처음에 모든 강의다. 정률을 고르면 최대 할인 칸이 나온다.
    expect(within(dialog).getByLabelText('모든 강의')).toBeChecked()
    expect(within(dialog).queryByLabelText('최대 할인 HP')).toBeNull()
    await userEvent.click(within(dialog).getByLabelText('정률 (%)'))
    await userEvent.type(within(dialog).getByLabelText('할인율 (%)'), '10')
    await userEvent.click(
      within(dialog).getByRole('button', { name: '만들기' }),
    )

    expect(
      await within(dialog).findByText(
        '모든 강의에 쓰는 정률 쿠폰은 최대 할인 HP를 입력해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(state.created).toEqual([])

    await userEvent.type(within(dialog).getByLabelText('최대 할인 HP'), '5000')
    await userEvent.click(
      within(dialog).getByRole('button', { name: '만들기' }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/coupons/100'),
    )
    expect(state.created).toHaveLength(1)
    expect(state.created[0]).toMatchObject({
      name: '겨울 맞이 10%',
      targetType: 'ANY_LECTURE',
      lectureId: null,
      discountType: 'RATE',
      discountValue: 10,
      maxDiscountAmount: 5000,
      quantity: 100,
      expiryType: 'RELATIVE',
      expiryDays: 30,
      fixedExpiresAt: null,
      stackable: false,
    })
    expect(state.created[0].issueStartAt).toMatch(/Z$/)
    expect(state.created[0].issueEndAt).toMatch(/Z$/)

    expect(
      await screen.findByRole('heading', { level: 1, name: '겨울 맞이 10%' }),
    ).toBeInTheDocument()
    expect(statusPill()).toHaveTextContent('열기 전')
    expect(screen.getByText('플랫폼 쿠폰')).toBeInTheDocument()
    expect(screen.getByText('10% 할인 · 최대 5,000 HP')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    await waitFor(() => expect(statusPill()).toHaveTextContent(/^발급 중$/))
    expect(state.actions).toEqual(['open 100'])
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '열기' })).toBeNull()
  })

  it('특정 강의 쿠폰은 강의 번호가 있어야 만들고, 최대 할인은 보내지 않는다', async () => {
    const state = mockCoupons()
    renderApp('/admin/coupons', 'ADMIN')

    await userEvent.click(
      await screen.findByRole('button', { name: '플랫폼 쿠폰 만들기' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '플랫폼 쿠폰 만들기',
    })
    await userEvent.type(within(dialog).getByLabelText('쿠폰 이름'), '강의 7')
    await userEvent.click(within(dialog).getByLabelText('특정 강의'))
    await userEvent.click(within(dialog).getByLabelText('정률 (%)'))
    await userEvent.type(within(dialog).getByLabelText('할인율 (%)'), '20')
    expect(within(dialog).queryByLabelText('최대 할인 HP')).toBeNull()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '만들기' }),
    )

    expect(
      await within(dialog).findByText('쿠폰을 쓸 강의를 골라 주세요.'),
    ).toBeInTheDocument()
    expect(state.created).toEqual([])

    await userEvent.type(within(dialog).getByLabelText('강의 번호'), '7')
    await userEvent.click(
      within(dialog).getByRole('button', { name: '만들기' }),
    )
    await waitFor(() => expect(state.created).toHaveLength(1))
    expect(state.created[0]).toMatchObject({
      targetType: 'LECTURE',
      lectureId: 7,
      discountType: 'RATE',
      discountValue: 20,
      maxDiscountAmount: null,
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: '강의 7' }),
    ).toBeInTheDocument()
  })

  it('BE가 정책 오류(INVALID_COUPON_POLICY)를 칸별로 주면 그 칸에 보여 준다', async () => {
    const state = mockCoupons({
      failNext: {
        'POST /coupons/admin': couponProblem(
          400,
          'INVALID_COUPON_POLICY',
          '쿠폰 정책이 올바르지 않습니다.',
          [{ field: 'quantity', message: '수량이 너무 많아요.' }],
        ),
      },
    })
    const router = renderApp('/admin/coupons', 'ADMIN')
    await userEvent.click(
      await screen.findByRole('button', { name: '플랫폼 쿠폰 만들기' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '플랫폼 쿠폰 만들기',
    })
    await userEvent.type(within(dialog).getByLabelText('쿠폰 이름'), '정액')
    await userEvent.type(within(dialog).getByLabelText('할인 HP'), '3000')
    await userEvent.click(
      within(dialog).getByRole('button', { name: '만들기' }),
    )

    expect(
      await within(dialog).findByText('수량이 너무 많아요.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('발급 수량')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(state.created).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/admin/coupons')
  })

  it('예산을 확보하지 못하면 안내하고 같은 버튼으로 다시 열 수 있다', async () => {
    const state = mockCoupons({
      admin: [
        coupon({
          couponId: 5,
          name: '플랫폼 3,000 HP',
          type: 'PLATFORM',
          applicantId: null,
          targetType: 'ANY_LECTURE',
          lectureId: null,
          basePrice: null,
          discountType: 'AMOUNT',
          discountValue: 3000,
        }),
      ],
      failNext: {
        'POST /coupons/admin/5/open': couponProblem(
          409,
          'PROMOTION_BUDGET_REJECTED',
          '예산 거절',
        ),
      },
    })
    renderApp('/admin/coupons/5', 'ADMIN')

    await userEvent.click(await screen.findByRole('button', { name: '열기' }))
    expect(
      await screen.findByText('예산을 확보하지 못했어요. 다시 열어 주세요.'),
    ).toBeInTheDocument()
    expect(statusPill()).toHaveTextContent('열기 전')
    const retry = screen.getByRole('button', { name: '열기' })
    expect(retry).toBeEnabled()

    await userEvent.click(retry)
    await waitFor(() => expect(statusPill()).toHaveTextContent(/^발급 중$/))
    expect(state.actions).toEqual(['open 5', 'open 5'])
    expect(
      screen.queryByText('예산을 확보하지 못했어요. 다시 열어 주세요.'),
    ).toBeNull()
  })

  it('발급 중 쿠폰은 중단·재개하고 확인 뒤 종료한다', async () => {
    const state = mockCoupons({
      admin: [coupon({ couponId: 6, name: '발급 중 쿠폰', status: 'OPEN' })],
    })
    renderApp('/admin/coupons/6', 'ADMIN')

    await userEvent.click(await screen.findByRole('button', { name: '중단' }))
    await waitFor(() => expect(statusPill()).toHaveTextContent('발급 중단'))
    expect(screen.queryByRole('button', { name: '중단' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '재개' }))
    await waitFor(() => expect(statusPill()).toHaveTextContent(/^발급 중$/))

    await userEvent.click(screen.getByRole('button', { name: '종료' }))
    const dialog = await screen.findByRole('dialog', {
      name: '쿠폰을 종료할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '종료' }))
    await waitFor(() => expect(statusPill()).toHaveTextContent(/^종료$/))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.actions).toEqual(['suspend 6', 'resume 6', 'close 6'])
    expect(
      within(screen.getByRole('region', { name: '쿠폰 정보' })).queryByRole(
        'button',
      ),
    ).toBeNull()
  })

  it('다른 변경과 겹치면 다시 시도하라고 하고 상태를 다시 불러온다', async () => {
    const seen = watchListRequests()
    mockCoupons({
      admin: [coupon({ couponId: 6, name: '발급 중 쿠폰', status: 'OPEN' })],
      failNext: {
        'POST /coupons/admin/6/suspend': couponProblem(
          409,
          'COUPON_CONCURRENT_UPDATE',
        ),
      },
    })
    renderApp('/admin/coupons?status=OPEN', 'ADMIN')

    const row = await item('발급 중 쿠폰')
    await userEvent.click(within(row).getByRole('button', { name: '중단' }))
    expect(
      await within(row).findByText('다른 변경과 겹쳤어요. 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(seen).toHaveLength(2))
  })

  it('일시적인 오류(503)는 잠시 후 다시 시도하라고 한다', async () => {
    mockCoupons({
      admin: [review()],
      failNext: {
        'POST /coupons/admin/3/approve': couponProblem(
          503,
          'PROMOTION_BUDGET_UNAVAILABLE',
        ),
      },
    })
    renderApp('/admin/coupons', 'ADMIN')

    const row = await item('가을맞이 10% 할인')
    await userEvent.click(within(row).getByRole('button', { name: '승인' }))
    expect(
      await within(row).findByText('잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
  })

  it('응답을 받지 못했는데 상태가 이미 발급 중이면 다시 시도로 남겨 같은 승인으로 마무리한다', async () => {
    const state = mockCoupons({ admin: [review()] })
    failAfterCommit(state, 3, 'approve', () => HttpResponse.error())
    renderApp('/admin/coupons/3', 'ADMIN')

    await userEvent.click(await screen.findByRole('button', { name: '승인' }))
    await waitFor(() => expect(statusPill()).toHaveTextContent(/^발급 중$/))
    expect(
      screen.getByText('응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: '다시 시도(승인)' }),
    )
    expect(
      await screen.findByText('승인했어요. 지금부터 발급돼요.'),
    ).toBeInTheDocument()
    expect(state.actions).toEqual(['approve 3', 'approve 3'])
  })

  it.each([
    [409, 'INVALID_COUPON_STATUS'],
    [404, 'COUPON_NOT_FOUND'],
  ] as const)(
    '다시 보내도 같은 실패(%i %s)는 다시 시도로 기록하지 않고 바로 알린다',
    async (status, code) => {
      mockCoupons({
        admin: [review()],
        failNext: {
          'POST /coupons/admin/3/approve': couponProblem(status, code, '실패'),
        },
      })
      renderApp('/admin/coupons', 'ADMIN')

      const row = await item('가을맞이 10% 할인')
      await userEvent.click(within(row).getByRole('button', { name: '승인' }))
      expect(await within(row).findByRole('alert')).toBeInTheDocument()
      expect(screen.queryByText(/요청을 마치지 못했어요/)).toBeNull()
      expect(
        screen.queryByRole('button', { name: '다시 시도(승인)' }),
      ).toBeNull()
      expect(useCouponRetryStore.getState()).toEqual({})
    },
  )

  it('승인이 503으로 실패했는데 상태가 이미 발급 중이면 상세에서 같은 승인을 다시 보내 마무리한다', async () => {
    const state = mockCoupons({ admin: [review()] })
    failAfterCommit(state, 3, 'approve')
    renderApp('/admin/coupons/3', 'ADMIN')

    await userEvent.click(await screen.findByRole('button', { name: '승인' }))
    // 다시 불러온 상태는 OPEN이라 승인 버튼은 없어지고 다시 시도 버튼이 남는다.
    await waitFor(() => expect(statusPill()).toHaveTextContent(/^발급 중$/))
    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '승인' })).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: '다시 시도(승인)' }),
    )
    expect(
      await screen.findByText('승인했어요. 지금부터 발급돼요.'),
    ).toBeInTheDocument()
    expect(state.actions).toEqual(['approve 3', 'approve 3'])
    expect(screen.queryByRole('button', { name: '다시 시도(승인)' })).toBeNull()
    expect(screen.queryByText('잠시 후 다시 시도해 주세요.')).toBeNull()
  })

  it('심사 목록에서 승인이 실패하고 쿠폰이 목록에서 빠져도 안내에서 다시 시도한다', async () => {
    const state = mockCoupons({ admin: [review()] })
    failAfterCommit(state, 3, 'approve')
    renderApp('/admin/coupons', 'ADMIN')

    const row = await item('가을맞이 10% 할인')
    await userEvent.click(within(row).getByRole('button', { name: '승인' }))
    expect(await screen.findByText('심사할 쿠폰이 없어요')).toBeInTheDocument()
    expect(
      screen.getByText(
        /승인 요청을 마치지 못했어요\. 잠시 후 다시 시도해 주세요\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '가을맞이 10% 할인' }),
    ).toHaveAttribute('href', '/admin/coupons/3')

    await userEvent.click(
      screen.getByRole('button', { name: '다시 시도(승인)' }),
    )
    expect(
      await screen.findByText('승인했어요. 지금부터 발급돼요.'),
    ).toBeInTheDocument()
    expect(state.actions).toEqual(['approve 3', 'approve 3'])
    expect(screen.queryByText(/요청을 마치지 못했어요/)).toBeNull()
  })

  it('관리자만 쿠폰 운영 메뉴를 본다', async () => {
    mockCoupons()
    renderApp('/admin/coupons', 'ADMIN')
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '쿠폰 운영' }),
    ).toHaveAttribute('href', '/admin/coupons')
  })

  it.each(['USER', 'VERIFIED_INFLUENCER'] as const)(
    '%s에게는 쿠폰 운영 메뉴가 없다',
    async (role) => {
      renderApp('/lectures', role)
      const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
      expect(within(nav).queryByRole('link', { name: '쿠폰 운영' })).toBeNull()
    },
  )
})
