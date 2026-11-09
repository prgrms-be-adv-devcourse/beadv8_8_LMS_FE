import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { MyLecture } from '@/entities/lecture/types'
import {
  coupon,
  couponProblem,
  mockCoupons,
  quietLectureRequests,
} from '@/test/couponMock'
import { expectFieldError } from '@/test/fieldError'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'
import { expectSuccessToast } from '@/test/toast'

const myLecture = (overrides: Partial<MyLecture>): MyLecture => ({
  lectureId: 7,
  title: '통기타 라이브 세팅',
  priceHp: 30000,
  thumbnailUrl: null,
  status: 'ON_SALE',
  rejectionReason: null,
  deleted: false,
  inspectionRequestedAt: '2026-10-01T10:00:00',
  inspectedAt: '2026-10-02T10:00:00',
  createdAt: '2026-10-01T10:00:00',
  ...overrides,
})

const LECTURES = [
  myLecture({}),
  myLecture({ lectureId: 9, title: '지운 강의', deleted: true }),
  myLecture({ lectureId: 8, title: '드럼 입문', status: 'PENDING_INSPECTION' }),
]

/** 내 강의(GET /lectures/me). pages개 페이지로 나눠 준다 */
function serveLectures(lectures: MyLecture[] = LECTURES, pages = 1) {
  server.use(
    http.get('*/api/v1/lectures/me', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 0)
      const per = Math.ceil(lectures.length / pages)
      return rs({
        content: lectures.slice(page * per, (page + 1) * per),
        page: {
          size: 20,
          number: page,
          totalElements: lectures.length,
          totalPages: pages,
        },
      })
    }),
  )
}

const applyPanel = () => screen.findByRole('region', { name: '새 쿠폰' })
const listPanel = () => screen.findByRole('region', { name: '내 쿠폰' })
const submitButton = () => screen.getByRole('button', { name: '쿠폰 신청' })

/** 맞는 값으로 폼을 채운다(발급 기간은 먼 미래라 지금 시각과 관계없다) */
async function fillValidForm() {
  await userEvent.type(await screen.findByLabelText('쿠폰 이름'), '겨울 특가')
  await userEvent.selectOptions(screen.getByLabelText('강의'), '7')
  fireEvent.change(screen.getByLabelText('발급 시작'), {
    target: { value: '2999-12-01T10:00' },
  })
  fireEvent.change(screen.getByLabelText('발급 종료'), {
    target: { value: '2999-12-31T23:59' },
  })
}

beforeEach(quietLectureRequests)

afterEach(() => {
  queryClient.clear()
})

describe('판매자 쿠폰 신청', () => {
  it('판매 중인 강의만 고를 수 있고, 신청하면 신청됨 쿠폰에서 심사를 요청한다', async () => {
    serveLectures(LECTURES, 2)
    const state = mockCoupons()
    renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '쿠폰 신청' }),
    ).toHaveAttribute('href', '/studio/coupons')

    // 두 번째 페이지의 강의까지 선택지에 들어오고, 판매 중이 아닌 강의는 고를 수 없고, 지운 강의는 없다.
    const lecture = await screen.findByLabelText('강의')
    await waitFor(() =>
      expect(
        within(lecture).getByRole('option', {
          name: '드럼 입문 (판매 중 아님)',
        }),
      ).toBeDisabled(),
    )
    expect(
      within(lecture).getByRole('option', { name: '통기타 라이브 세팅' }),
    ).toBeEnabled()
    expect(
      within(lecture).queryByRole('option', { name: /지운 강의/ }),
    ).not.toBeInTheDocument()

    await fillValidForm()
    await userEvent.selectOptions(screen.getByLabelText('할인 방식'), 'AMOUNT')
    const amount = screen.getByLabelText('할인 HP')
    await userEvent.clear(amount)
    await userEvent.type(amount, '3,000')
    const quantity = screen.getByLabelText('수량')
    await userEvent.clear(quantity)
    await userEvent.type(quantity, '50')
    const days = screen.getByLabelText('사용 기간 (일)')
    await userEvent.clear(days)
    await userEvent.type(days, '14')
    await userEvent.click(
      screen.getByRole('checkbox', { name: '다른 쿠폰과 함께 쓸 수 있어요' }),
    )
    await userEvent.click(submitButton())

    await waitFor(() => expect(state.created).toHaveLength(1))
    expect(state.created[0]).toEqual({
      name: '겨울 특가',
      targetType: 'LECTURE',
      lectureId: 7,
      discountType: 'AMOUNT',
      discountValue: 3000,
      maxDiscountAmount: null,
      quantity: 50,
      // 한국 시간 입력을 UTC Instant로 보낸다.
      issueStartAt: '2999-12-01T01:00:00.000Z',
      issueEndAt: '2999-12-31T14:59:00.000Z',
      expiryType: 'RELATIVE',
      expiryDays: 14,
      fixedExpiresAt: null,
      stackable: true,
    })

    const panel = await applyPanel()
    expect(
      await within(panel).findByText(/쿠폰을 신청했어요/),
    ).toBeInTheDocument()
    expect(within(panel).getByText('신청됨')).toHaveClass('pill')
    expect(panel).toHaveTextContent('통기타 라이브 세팅')
    expect(panel).toHaveTextContent('3,000 HP 할인')
    expect(panel).toHaveTextContent('받은 날부터 14일')

    // 목록도 새로 불러와 신청한 쿠폰이 보인다.
    expect(
      await within(await listPanel()).findByRole('listitem', {
        name: '겨울 특가',
      }),
    ).toBeInTheDocument()

    await userEvent.click(
      within(panel).getByRole('button', { name: '심사 요청' }),
    )
    await waitFor(() => expect(state.actions).toEqual(['review 100']))
    expect(await within(panel).findByText('심사 중')).toHaveClass(
      'pill',
      'warn',
    )
    expect(
      within(panel).queryByRole('button', { name: '심사 요청' }),
    ).not.toBeInTheDocument()
    await expectSuccessToast('심사를 요청했어요. 승인되면 발급이 시작돼요.')

    // 다른 쿠폰 신청으로 빈 폼에 돌아간다.
    await userEvent.click(
      within(panel).getByRole('button', { name: '다른 쿠폰 신청' }),
    )
    expect(screen.getByLabelText('쿠폰 이름')).toHaveValue('')
  })

  it('신청 뒤 아래 목록에서 심사를 요청해도 위 신청 결과가 함께 바뀐다', async () => {
    serveLectures(LECTURES, 2)
    const state = mockCoupons()
    renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')
    await screen.findByLabelText('강의')
    await fillValidForm()
    await userEvent.click(submitButton())
    const panel = await applyPanel()
    await within(panel).findByText(/쿠폰을 신청했어요/)

    const row = await within(await listPanel()).findByRole('listitem', {
      name: '겨울 특가',
    })
    await userEvent.click(
      within(row).getByRole('button', { name: '심사 요청' }),
    )
    await waitFor(() => expect(state.actions).toEqual(['review 100']))
    expect(await within(panel).findByText('심사 중')).toHaveClass('pill')
    expect(panel).toHaveTextContent('쿠폰 심사를 요청했어요.')
    expect(
      within(panel).queryByRole('button', { name: '심사 요청' }),
    ).not.toBeInTheDocument()

    // 승인·반려 등으로 심사 중이 아니게 되면 '심사를 요청했어요'로 단정하지 않고 실제 상태를 보인다.
    for (const [next, label] of [
      ['OPEN', '발급 중'],
      ['REJECTED', '반려'],
      ['BRAND_NEW', '알 수 없는 상태'],
    ] as const) {
      state.seller[0].status = next as never
      await queryClient.invalidateQueries()
      expect(await within(panel).findByText(label)).toHaveClass('pill')
      expect(panel).not.toHaveTextContent('쿠폰 심사를 요청했어요.')
      expect(panel).toHaveTextContent('쿠폰 상태가 바뀌었어요.')
    }
  })

  it('고정 만료는 만료 일수 대신 만료 일시를 보낸다', async () => {
    serveLectures()
    const state = mockCoupons()
    renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')

    await fillValidForm()
    await userEvent.selectOptions(screen.getByLabelText('만료 방식'), 'FIXED')
    expect(screen.queryByLabelText('사용 기간 (일)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('만료 일시'), {
      target: { value: '3000-01-31T23:59' },
    })
    await userEvent.click(submitButton())

    await waitFor(() => expect(state.created).toHaveLength(1))
    expect(state.created[0]).toMatchObject({
      discountType: 'RATE',
      discountValue: 10,
      maxDiscountAmount: null,
      expiryType: 'FIXED',
      expiryDays: null,
      fixedExpiresAt: '3000-01-31T14:59:00.000Z',
      stackable: false,
    })
  })

  it('정률 범위·발급 기간·고정 만료가 BE 규칙에 맞지 않으면 그 칸을 안내하고 보내지 않는다', async () => {
    serveLectures()
    const state = mockCoupons()
    renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')
    await fillValidForm()

    const rate = screen.getByLabelText('할인율 (%)')
    await userEvent.clear(rate)
    await userEvent.type(rate, '101')
    await userEvent.click(submitButton())
    expectFieldError(rate, '할인율은 1~100 사이 정수로 입력해 주세요.')
    await waitFor(() => expect(rate).toHaveFocus())

    await userEvent.clear(rate)
    await userEvent.type(rate, '100')
    fireEvent.change(screen.getByLabelText('발급 종료'), {
      target: { value: '2999-12-01T10:00' },
    })
    await userEvent.click(submitButton())
    expectFieldError(
      screen.getByLabelText('발급 종료'),
      '발급 종료는 시작보다 뒤여야 해요.',
    )

    fireEvent.change(screen.getByLabelText('발급 종료'), {
      target: { value: '2999-12-31T23:59' },
    })
    await userEvent.selectOptions(screen.getByLabelText('만료 방식'), 'FIXED')
    fireEvent.change(screen.getByLabelText('만료 일시'), {
      target: { value: '2999-12-31T23:59' },
    })
    await userEvent.click(submitButton())
    expectFieldError(
      screen.getByLabelText('만료 일시'),
      '만료 일시는 발급 종료보다 뒤여야 해요.',
    )

    expect(state.created).toHaveLength(0)
  })

  it('판매 중이 아닌 강의(409)는 강의 칸에, 정책 오류(400)는 해당 칸과 폼에, 권한 없음(403)은 폼에 보인다', async () => {
    serveLectures()
    const state = mockCoupons()
    renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')
    await fillValidForm()

    state.failNext['POST /coupons/seller'] = couponProblem(
      409,
      'COUPON_LECTURE_NOT_ON_SALE',
      '판매 중인 강의가 아닙니다.',
    )
    await userEvent.click(submitButton())
    await waitFor(() =>
      expectFieldError(
        screen.getByLabelText('강의'),
        '판매 중인 강의에만 쿠폰을 신청할 수 있어요.',
      ),
    )

    state.failNext['POST /coupons/seller'] = couponProblem(
      400,
      'INVALID_COUPON_POLICY',
      '쿠폰 정책이 올바르지 않습니다.',
      [
        { field: 'quantity', message: '수량이 너무 많습니다.' },
        { field: 'targetType', message: '대상을 확인해 주세요.' },
      ],
    )
    await userEvent.click(submitButton())
    await waitFor(() =>
      expectFieldError(screen.getByLabelText('수량'), '수량이 너무 많습니다.'),
    )
    // 폼에 없는 칸(대상)의 오류는 폼 위에 적는다.
    expect(
      screen
        .getAllByRole('alert')
        .some((el) => el.textContent === '대상을 확인해 주세요.'),
    ).toBe(true)

    // 403은 토큰을 다시 받아 한 번 더 보내므로 두 번 모두 거절한다.
    let forbidden = 0
    server.use(
      http.post('*/api/v1/coupons/seller', () => {
        forbidden++
        return couponProblem(
          403,
          'NOT_LECTURE_SELLER',
          '강의 판매자가 아닙니다.',
        )
      }),
    )
    await userEvent.click(submitButton())
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some(
            (el) =>
              el.textContent ===
              '내가 판매하는 강의에만 쿠폰을 신청할 수 있어요.',
          ),
      ).toBe(true),
    )
    expect(state.created).toHaveLength(2)
    expect(forbidden).toBe(2)
    expect(
      screen.queryByRole('button', { name: '심사 요청' }),
    ).not.toBeInTheDocument()
  })

  it('판매 중인 강의가 없으면 신청 폼 대신 안내를 보인다', async () => {
    serveLectures([LECTURES[2]])
    mockCoupons()
    renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')

    const panel = await applyPanel()
    expect(
      await within(panel).findByText(/판매 중인 강의가 없어요/),
    ).toBeInTheDocument()
    expect(within(panel).queryByLabelText('쿠폰 이름')).not.toBeInTheDocument()
  })

  it('내 쿠폰 목록을 상태로 거르고, 반려 사유를 보이고, 발급 중인 쿠폰을 확인 뒤 중단한다', async () => {
    serveLectures()
    const state = mockCoupons({
      seller: [
        coupon({
          couponId: 1,
          name: '발급 중 쿠폰',
          status: 'OPEN',
          issuedCount: 40,
        }),
        coupon({
          couponId: 2,
          name: '반려된 쿠폰',
          status: 'REJECTED',
          rejectReason: '할인율이 너무 높아요',
        }),
        coupon({ couponId: 3, name: '신청한 쿠폰', status: 'DRAFT' }),
      ],
    })
    const router = renderApp('/studio/coupons', 'VERIFIED_INFLUENCER')

    const list = await listPanel()
    const open = await within(list).findByRole('listitem', {
      name: '발급 중 쿠폰',
    })
    expect(open).toHaveTextContent('통기타 라이브 세팅')
    expect(open).toHaveTextContent('10% 할인')
    expect(open).toHaveTextContent('남은 60장 / 100장')
    expect(within(open).getByText('발급 중')).toHaveClass('pill', 'ok')
    expect(
      within(open).getByRole('link', { name: '발급 중 쿠폰' }),
    ).toHaveAttribute('href', '/studio/coupons/1')
    const draft = within(list).getByRole('listitem', { name: '신청한 쿠폰' })
    expect(
      within(draft).getByRole('button', { name: '심사 요청' }),
    ).toBeInTheDocument()

    const filters = within(list).getByRole('group', { name: '쿠폰 상태' })
    expect(
      within(filters).getByRole('button', { name: '전체' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(filters).getByRole('button', { name: '반려' }))
    expect(router.state.location.search).toBe('?status=REJECTED')
    // URL은 바로 바뀌지만 버튼은 다음 렌더에서 바뀐다(느린 CI에서는 그 사이에 단언할 수 있다).
    await waitFor(() =>
      expect(
        within(filters).getByRole('button', { name: '반려' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(1),
    )
    const rejected = within(list).getByRole('listitem', { name: '반려된 쿠폰' })
    expect(rejected).toHaveTextContent('반려 사유: 할인율이 너무 높아요')
    expect(within(rejected).queryByRole('button')).not.toBeInTheDocument()

    await userEvent.click(within(filters).getByRole('button', { name: '전체' }))
    expect(router.state.location.search).toBe('')
    const row = await within(list).findByRole('listitem', {
      name: '발급 중 쿠폰',
    })
    await userEvent.click(within(row).getByRole('button', { name: '중단' }))
    const dialog = screen.getByRole('dialog', { name: '쿠폰 발급 중단' })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '발급 중단' }),
    )
    await waitFor(() => expect(state.actions).toEqual(['suspend 1']))
    expect(await within(row).findByText('발급 중단')).toHaveClass('pill')
    expect(
      within(row).queryByRole('button', { name: '중단' }),
    ).not.toBeInTheDocument()
    await expectSuccessToast(
      '발급을 멈췄어요. 이미 받은 쿠폰은 계속 쓸 수 있어요.',
    )
  })

  it('상세에서 쿠폰 조건을 보고 심사를 요청한다', async () => {
    serveLectures()
    const state = mockCoupons({
      seller: [
        coupon({
          couponId: 5,
          name: '상세 쿠폰',
          expiryType: 'FIXED',
          expiryDays: null,
          fixedExpiresAt: '2999-12-31T14:59:00Z',
          stackable: true,
        }),
      ],
    })
    renderApp('/studio/coupons/5', 'VERIFIED_INFLUENCER')

    const detail = await screen.findByRole('region', { name: '상세 쿠폰' })
    expect(detail).toHaveTextContent('통기타 라이브 세팅')
    expect(detail).toHaveTextContent('10% 할인')
    expect(detail).toHaveTextContent('12/31')
    expect(detail).toHaveTextContent('쓸 수 있어요')
    expect(within(detail).getByText('신청됨')).toHaveClass('pill')
    expect(screen.queryByLabelText('쿠폰 이름')).not.toBeInTheDocument()

    await userEvent.click(
      within(detail).getByRole('button', { name: '심사 요청' }),
    )
    await waitFor(() => expect(state.actions).toEqual(['review 5']))
    expect(await within(detail).findByText('심사 중')).toHaveClass('pill')
    expect(
      within(detail).getByRole('link', { name: '내 쿠폰 목록' }),
    ).toHaveAttribute('href', '/studio/coupons')
  })

  it('강의 판매 화면에 쿠폰 신청 링크가 있다', async () => {
    serveLectures()
    server.use(
      http.get('*/api/v1/lectures/sales', () =>
        rs({
          content: [],
          page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
        }),
      ),
    )
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const head = (
      await screen.findByRole('heading', { level: 1, name: '강의 판매' })
    ).closest('.page-head') as HTMLElement
    expect(
      within(head).getByRole('link', { name: '쿠폰 신청' }),
    ).toHaveAttribute('href', '/studio/coupons')
  })

  it('인증 전 인플루언서에게는 쿠폰 신청 메뉴가 없다', async () => {
    renderApp('/lectures', 'INFLUENCER')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).queryByRole('link', { name: '쿠폰 신청' }),
    ).not.toBeInTheDocument()
  })
})
