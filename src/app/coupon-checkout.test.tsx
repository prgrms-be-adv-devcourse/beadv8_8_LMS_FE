import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { LectureDetail } from '@/entities/lecture/types'
import type { Order } from '@/entities/order/types'
import {
  couponQuote,
  memberCoupon,
  mockCoupons,
  quoteCoupon,
  type QuoteRequest,
} from '@/test/couponMock'
import { mockCreateOrder } from '@/test/lectureOrders'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

afterEach(() => queryClient.clear())

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

/** 강의 7 상세(바로 구매로 주문 확인을 연다) */
function mockLectureDetail() {
  server.use(
    http.get('*/api/v1/lectures/7', () => rs(detail)),
    http.get('*/api/v1/lectures/cart', () =>
      rs({ items: [], purchasableTotalHp: 0 }),
    ),
    // 바로 구매 버튼이 보유 여부를 보려고 부른다(산 강의 없음)
    http.get('*/api/v1/lectures/purchased', () =>
      rs({
        content: [],
        page: { size: 100, number: 0, totalElements: 0, totalPages: 0 },
      }),
    ),
    http.get('*/api/v1/lectures/7/reviews', () =>
      rs({
        content: [],
        page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
      }),
    ),
  )
}

/** 강의 7을 산 주문(결제액 = buyerAmountHp) */
function paidOrder(discountHp: number): Order {
  const buyerAmountHp = 30000 - discountHp
  return {
    orderId: 900,
    totalAmountHp: 30000,
    discountHp,
    buyerAmountHp,
    status: 'PAID',
    progress: 'IN_PROGRESS',
    processingStatus: null,
    orderedAt: '2026-11-10T10:00:00',
    paidAt: '2026-11-10T10:00:00',
    canceledAt: null,
    items: [
      {
        orderItemId: 901,
        lectureId: 7,
        lectureTitle: '첫 방송 세팅',
        priceHp: 30000,
        discountHp,
        buyerAmountHp,
        status: 'PURCHASED',
        processingStatus: null,
        purchasedAt: '2026-11-10T10:00:00',
        confirmedAt: null,
        confirmationType: null,
        autoConfirmAt: '2999-11-18T00:00:00',
        payoutScheduledAt: '2999-12-10T00:00:00',
        canceledAt: null,
        returnedAt: null,
        objectionStatus: 'NONE',
      },
    ],
  }
}

const sellerCoupon = memberCoupon({
  memberCouponId: 11,
  couponId: 1,
  couponName: '가을맞이 10% 할인',
})

async function openCheckout() {
  renderApp('/lectures/7', 'USER', { availableTotalHp: 130000 })
  await userEvent.click(
    await screen.findByRole('button', { name: '바로 구매' }),
  )
  return screen.findByRole('dialog', { name: '주문 확인' })
}

describe('주문 확인 쿠폰 추천', () => {
  it('추천을 적용해 할인·결제액을 보이고, 주문은 미리보기의 쿠폰 매핑과 결제액으로 보낸다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [
        couponQuote(
          [
            {
              lectureId: 7,
              price: 30000,
              coupons: [quoteCoupon({ memberCouponId: 11, discount: 3000 })],
            },
          ],
          { recommended: true, optimal: true },
        ),
      ],
    })
    const created = mockCreateOrder(paidOrder(3000))
    const dialog = await openCheckout()

    const area = within(dialog).getByRole('region', { name: '쿠폰 할인' })
    expect(await within(area).findByText('최대 할인')).toBeInTheDocument()
    const row = within(area).getByRole('group', { name: '첫 방송 세팅' })
    expect(row).toHaveTextContent('가을맞이 10% 할인 · −3,000 HP')
    expect(row).toHaveTextContent('27,000 HP')
    expect(within(area).getByText('쿠폰 할인').nextSibling).toHaveTextContent(
      '−3,000',
    )
    expect(within(dialog).getByText('결제할 HP').nextSibling).toHaveTextContent(
      '27,000 HP',
    )
    expect(coupons.quoteRequests).toEqual([
      { lectureIds: [7], selections: null },
    ])

    await userEvent.click(
      within(dialog).getByRole('button', { name: '27,000 HP 결제' }),
    )
    expect(
      await screen.findByRole('heading', { name: '주문을 마쳤어요' }),
    ).toBeInTheDocument()
    expect(created.bodies).toEqual([
      {
        lectureIds: [7],
        coupons: [{ memberCouponId: 11, lectureId: 7 }],
        expectedBuyerAmountHp: 27000,
      },
    ])
  })

  it('최대 할인을 보장하지 않는 추천은 추천 적용이라고만 쓴다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [
        couponQuote(
          [
            {
              lectureId: 7,
              price: 30000,
              coupons: [quoteCoupon({ memberCouponId: 11, discount: 3000 })],
            },
          ],
          { recommended: true, optimal: false },
        ),
      ],
    })
    const dialog = await openCheckout()
    expect(await within(dialog).findByText('추천 적용')).toBeInTheDocument()
    expect(within(dialog).queryByText('최대 할인')).not.toBeInTheDocument()
  })

  it('쓸 수 있는 쿠폰이 없으면 지금처럼 정가로, 쿠폰 없이 주문한다', async () => {
    mockLectureDetail()
    mockCoupons({ quotePrices: { 7: 30000 } })
    const created = mockCreateOrder(paidOrder(0))
    const dialog = await openCheckout()

    expect(
      await within(dialog).findByText('이 주문에 쓸 수 있는 쿠폰이 없어요.'),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '30,000 HP 결제' }),
    )
    await waitFor(() => expect(created.bodies).toEqual([{ lectureIds: [7] }]))
  })

  it('100% 쿠폰으로 결제액이 0이면 0 HP 결제로 바로 주문이 끝난다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [
        couponQuote(
          [
            {
              lectureId: 7,
              price: 30000,
              coupons: [quoteCoupon({ memberCouponId: 11, discount: 30000 })],
            },
          ],
          { recommended: true, optimal: true },
        ),
      ],
    })
    const created = mockCreateOrder(paidOrder(30000))
    const dialog = await openCheckout()

    expect(
      await within(dialog).findByText('결제할 HP가 없어 바로 주문이 끝나요.'),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '0 HP 결제' }),
    )
    expect(
      await screen.findByRole('heading', { name: '주문을 마쳤어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText('결제한 HP').nextSibling).toHaveTextContent('0 HP')
    expect(created.bodies[0]).toMatchObject({ expectedBuyerAmountHp: 0 })
  })

  it('할인을 계산하는 동안에는 결제를 막는다', async () => {
    mockLectureDetail()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [
        couponQuote([{ lectureId: 7, price: 30000 }], { recommended: true }),
      ],
    })
    // 미리보기 응답을 잠시 붙잡아 둔다(이 핸들러가 먼저 받아 기다린 뒤 흉내 BE로 넘긴다).
    server.use(
      http.post('*/api/v1/coupons/me/quote', async () => {
        await gate
      }),
    )
    const dialog = await openCheckout()
    expect(
      await within(dialog).findByRole('button', { name: '할인 계산 중…' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('region', { name: '쿠폰 할인' }),
    ).toHaveAttribute('aria-busy', 'true')
    release()
    expect(
      await within(dialog).findByRole('button', { name: '30,000 HP 결제' }),
    ).toBeEnabled()
  })
})

/**
 * 강의 7(30,000 HP)의 미리보기 흉내. 추천(null)은 recommend 쿠폰들을, 매핑을 주면 그 쿠폰들을 적용한다.
 * 쿠폰별 할인·종류는 table에서 찾는다
 */
function quoteFor(
  table: Record<number, { discount: number; type?: 'SELLER' | 'PLATFORM' }>,
  recommend: number[],
  flags = { optimal: true },
) {
  return ({ selections }: QuoteRequest) => {
    const ids = selections?.map((s) => s.memberCouponId) ?? recommend
    return couponQuote(
      [
        {
          lectureId: 7,
          price: 30000,
          coupons: ids.map((id) =>
            quoteCoupon({
              memberCouponId: id,
              couponType: table[id].type ?? 'SELLER',
              discount: table[id].discount,
            }),
          ),
        },
      ],
      { recommended: selections === null, optimal: flags.optimal },
    )
  }
}

describe('주문 확인 쿠폰 직접 선택', () => {
  const second = memberCoupon({
    memberCouponId: 12,
    couponId: 2,
    couponName: '3천 HP 할인',
    discountType: 'AMOUNT',
    discountValue: 3000,
    stackable: true,
  })

  it('쿠폰 안 쓰기는 쿠폰 없이 계산하고, 주문에도 쿠폰을 보내지 않는다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon] },
      couponTypes: { 1: 'SELLER' },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
    })
    const created = mockCreateOrder(paidOrder(0))
    const dialog = await openCheckout()

    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 안 쓰기' }),
    )
    expect(
      await within(dialog).findByText('쿠폰을 쓰지 않아요.'),
    ).toBeInTheDocument()
    expect(coupons.quoteRequests.at(-1)).toEqual({
      lectureIds: [7],
      selections: [],
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '30,000 HP 결제' }),
    )
    await waitFor(() => expect(created.bodies).toEqual([{ lectureIds: [7] }]))
  })

  it('직접 고른 매핑으로 다시 계산하고, 추천으로 돌아갈 수 있다. 목록에 종류가 없으면 쿠폰 상세에서 한 번만 가져온다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      // 회원 쿠폰 목록에 종류가 없는 응답이면 쿠폰 상세의 type으로 칸을 나눈다(대체 조회)
      usable: {
        7: [sellerCoupon, second].map((c) => ({
          ...c,
          couponType: undefined,
        })),
      },
      couponTypes: { 1: 'SELLER', 2: 'SELLER' },
      quotes: [
        quoteFor({ 11: { discount: 3000 }, 12: { discount: 3000 } }, [11]),
      ],
    })
    const created = mockCreateOrder(paidOrder(3000))
    const dialog = await openCheckout()

    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    const seller = within(dialog).getByRole('group', { name: '판매자 쿠폰' })
    const pickSecond = await within(seller).findByRole('radio', {
      name: /3천 HP 할인/,
    })
    expect(
      within(seller).getByRole('radio', { name: /가을맞이 10% 할인/ }),
    ).toBeChecked()
    expect(within(seller).getByText('단독 사용')).toBeInTheDocument()
    await userEvent.click(pickSecond)

    await waitFor(() =>
      expect(coupons.quoteRequests.at(-1)).toEqual({
        lectureIds: [7],
        selections: [{ memberCouponId: 12, lectureId: 7 }],
      }),
    )
    expect(
      await within(dialog).findByText('3천 HP 할인 · −3,000 HP'),
    ).toBeInTheDocument()
    // 직접 고른 결과에는 추천 배지를 달지 않는다
    expect(within(dialog).queryByText('최대 할인')).not.toBeInTheDocument()
    expect(coupons.detailCalls).toEqual({ 1: 1, 2: 1 })

    await userEvent.click(
      within(dialog).getByRole('button', { name: '추천으로 돌아가기' }),
    )
    expect(await within(dialog).findByText('최대 할인')).toBeInTheDocument()
    expect(coupons.quoteRequests.at(-1)?.selections).toBeNull()

    await userEvent.click(
      within(dialog).getByRole('button', { name: '27,000 HP 결제' }),
    )
    await waitFor(() =>
      expect(created.bodies[0]).toEqual({
        lectureIds: [7],
        coupons: [{ memberCouponId: 11, lectureId: 7 }],
        expectedBuyerAmountHp: 27000,
      }),
    )
  })

  it('플랫폼 쿠폰 칸은 막아 두고 이유를 알린다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: {
        7: [
          sellerCoupon,
          memberCoupon({
            memberCouponId: 21,
            couponId: 5,
            couponName: '전 강의 2천',
            couponType: 'PLATFORM',
          }),
        ],
      },
      couponTypes: { 1: 'SELLER' },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
    })
    const dialog = await openCheckout()
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    const platform = within(dialog).getByRole('group', { name: '플랫폼 쿠폰' })
    expect(platform).toBeDisabled()
    expect(platform).toHaveAccessibleDescription(
      '플랫폼 쿠폰은 아직 사용할 수 없어요.',
    )
    expect(
      within(platform).getByRole('radio', { name: /전 강의 2천/ }),
    ).toBeDisabled()
  })

  it('추천에 플랫폼 쿠폰이 섞여 오면 그 쿠폰만 빼고 다시 계산해 알린다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon] },
      couponTypes: { 1: 'SELLER' },
      quotes: [
        quoteFor(
          { 11: { discount: 3000 }, 21: { discount: 2000, type: 'PLATFORM' } },
          [11, 21],
        ),
      ],
    })
    const created = mockCreateOrder(paidOrder(3000))
    const dialog = await openCheckout()

    expect(
      await within(dialog).findByText(
        /플랫폼 쿠폰은 아직 사용할 수 없어요\. 플랫폼 쿠폰을 빼고/,
      ),
    ).toBeInTheDocument()
    expect(coupons.quoteRequests).toEqual([
      { lectureIds: [7], selections: null },
      { lectureIds: [7], selections: [{ memberCouponId: 11, lectureId: 7 }] },
    ])
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '27,000 HP 결제' }),
    )
    await waitFor(() =>
      expect(created.bodies[0]?.coupons).toEqual([
        { memberCouponId: 11, lectureId: 7 },
      ]),
    )
  })

  it('직접 고른 쿠폰이 할인되지 않아도 쿠폰은 사용된다고 알린다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon, second] },
      couponTypes: { 1: 'SELLER', 2: 'SELLER' },
      quotes: [quoteFor({ 11: { discount: 3000 }, 12: { discount: 0 } }, [11])],
    })
    const dialog = await openCheckout()
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    await userEvent.click(
      await within(dialog).findByRole('radio', { name: /3천 HP 할인/ }),
    )
    expect(
      await within(dialog).findByText(
        /이 강의에서는 할인되지 않지만 쿠폰은 사용돼요/,
      ),
    ).toBeInTheDocument()
  })
})

/** 주문 거절 ProblemDetail(쿠폰 오류는 couponCode·memberCouponId 속성을 싣는다) */
const orderProblem = (
  status: number,
  code: string,
  extra: { couponCode?: string; memberCouponId?: number } = {},
) =>
  HttpResponse.json(
    { status, code, detail: `BE 문구 ${code}`, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

describe('쿠폰 주문 오류', () => {
  afterEach(() => vi.useRealTimers())

  /** 추천으로 판매자 쿠폰 11(3,000 HP 할인)을 적용한 주문 확인을 연다 */
  async function openWithCoupon() {
    mockLectureDetail()
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon] },
      couponTypes: { 1: 'SELLER' },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
    })
    const dialog = await openCheckout()
    const pay = await within(dialog).findByRole('button', {
      name: '27,000 HP 결제',
    })
    return { coupons, dialog, pay }
  }

  it('결제 금액이 바뀌면(ORDER_QUOTE_CHANGED) 알리고 같은 모드로 다시 계산한다. 자동으로 다시 주문하지 않는다', async () => {
    const created = mockCreateOrder(orderProblem(409, 'ORDER_QUOTE_CHANGED'))
    const { coupons, dialog, pay } = await openWithCoupon()
    await userEvent.click(pay)

    expect(
      await within(dialog).findByText(
        '결제 금액이 바뀌었어요. 다시 확인해 주세요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(coupons.quoteRequests).toHaveLength(2))
    expect(coupons.quoteRequests[1]).toEqual({
      lectureIds: [7],
      selections: null,
    })
    expect(
      await within(dialog).findByRole('button', { name: '27,000 HP 결제' }),
    ).toBeEnabled()
    expect(created.bodies).toHaveLength(1)
    // 쿠폰 오류는 BE 문구가 아니라 code에 맞는 문구로 보인다
    expect(screen.queryByText(/BE 문구/)).not.toBeInTheDocument()
  })

  it('쿠폰 계산이 거절되면(COUPON_CALCULATION_REJECTED) 그 쿠폰 옆에 사유를 보이고 쿠폰을 다시 부른다', async () => {
    mockCreateOrder(
      orderProblem(409, 'COUPON_CALCULATION_REJECTED', {
        couponCode: 'COUPON_NOT_USABLE',
        memberCouponId: 11,
      }),
    )
    const { coupons, dialog, pay } = await openWithCoupon()
    const quoteCalls = () => coupons.quoteRequests.length
    await userEvent.click(pay)

    const alert = await within(dialog).findByText(
      '이미 쓰였거나 만료된 쿠폰이에요.',
      {
        selector: '[role="alert"]',
      },
    )
    expect(alert).toHaveTextContent(
      '가을맞이 10% 할인: 이미 쓰였거나 만료된 쿠폰이에요.',
    )
    await waitFor(() => expect(quoteCalls()).toBe(2))
    // 사용 가능 쿠폰도 다시 부른다
    await waitFor(() => expect(coupons.usableCalls[7]).toBe(2))
    // 이 흉내 BE는 같은 쿠폰을 다시 추천하므로 쿠폰 줄이 남는다. 그 쿠폰 옆에도 사유를 보인다
    // (실제 BE는 쓸 수 없는 쿠폰을 다시 추천하지 않아 위의 알림만 남는다)
    expect(
      await within(
        within(dialog).getByRole('group', { name: '첫 방송 세팅' }),
      ).findByText(/이미 쓰였거나 만료된 쿠폰이에요/),
    ).toHaveAttribute('role', 'alert')
  })

  it('쿠폰 예약이 거절되면(COUPON_RESERVATION_REJECTED) 사유를 보이고, 직접 고른 매핑에서 그 쿠폰을 빼고 다시 계산한다', async () => {
    mockCreateOrder(
      orderProblem(409, 'COUPON_RESERVATION_REJECTED', {
        couponCode: 'COUPON_POLICY_VERSION_CHANGED',
        memberCouponId: 11,
      }),
    )
    const { coupons, dialog } = await openWithCoupon()
    // 직접 고른 매핑으로 바꾼다(쿠폰 11을 다시 고른다)
    await userEvent.click(
      within(dialog).getByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    await userEvent.click(
      within(dialog).getByRole('radio', { name: '쓰지 않음', checked: false }),
    )
    await userEvent.click(
      await within(dialog).findByRole('radio', { name: /가을맞이 10% 할인/ }),
    )
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '27,000 HP 결제' }),
    )

    expect(
      await within(dialog).findAllByText(/쿠폰이나 강의 가격이 바뀌었어요/),
    ).not.toHaveLength(0)
    await waitFor(() =>
      expect(coupons.quoteRequests.at(-1)).toEqual({
        lectureIds: [7],
        selections: [],
      }),
    )
  })

  it('플랫폼 쿠폰 재원이 없으면(COUPON_PLATFORM_FUNDING_UNAVAILABLE) 알리고, 플랫폼 쿠폰을 뺀 매핑으로 다시 계산한다', async () => {
    mockLectureDetail()
    // BE가 플랫폼 쿠폰을 담아 계산하는 경우(재원 설정이 켜졌다 꺼지는 사이 등): 어떤 매핑을 보내도 플랫폼 쿠폰 21을 함께 담는다
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [
        ({ selections }: QuoteRequest) =>
          couponQuote(
            [
              {
                lectureId: 7,
                price: 30000,
                coupons: [
                  quoteCoupon({ memberCouponId: 11, discount: 3000 }),
                  quoteCoupon({
                    memberCouponId: 21,
                    couponType: 'PLATFORM',
                    discount: 2000,
                  }),
                ],
              },
            ],
            { recommended: selections === null, optimal: true },
          ),
      ],
    })
    const created = mockCreateOrder(
      orderProblem(409, 'COUPON_PLATFORM_FUNDING_UNAVAILABLE'),
    )
    const dialog = await openCheckout()
    const pay = await within(dialog).findByRole('button', {
      name: '25,000 HP 결제',
    })
    const before = coupons.quoteRequests.length
    await userEvent.click(pay)
    expect(created.bodies[0]?.coupons).toEqual([
      { memberCouponId: 11, lectureId: 7 },
      { memberCouponId: 21, lectureId: 7 },
    ])
    expect(
      await within(dialog).findByText('플랫폼 쿠폰은 아직 사용할 수 없어요.', {
        selector: '[role="alert"]',
      }),
    ).toBeInTheDocument()
    // 플랫폼 쿠폰을 뺀 매핑(판매자 쿠폰만)이 지금 키와 같아도 다시 계산한다
    await waitFor(() => expect(coupons.quoteRequests.length).toBe(before + 1))
    expect(coupons.quoteRequests.at(-1)).toEqual({
      lectureIds: [7],
      selections: [{ memberCouponId: 11, lectureId: 7 }],
    })
  })

  it('쿠폰을 확인할 수 없으면(503 COUPON_UNAVAILABLE) 잠시 후 다시 하라고 하고 다시 계산하지 않는다', async () => {
    mockCreateOrder(orderProblem(503, 'COUPON_UNAVAILABLE'))
    const { coupons, dialog, pay } = await openWithCoupon()
    await userEvent.click(pay)
    expect(
      await within(dialog).findByText(
        '지금은 쿠폰을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(coupons.quoteRequests).toHaveLength(1)
    // 실패 뒤 지갑을 다시 불러오므로 버튼이 다시 열릴 때까지 기다린다
    expect(
      await within(dialog).findByRole('button', { name: '27,000 HP 결제' }),
    ).toBeEnabled()
  })

  it('202면 완료 화면에서 결제 처리 중을 보이고, 결제가 끝나면 결제한 HP(할인 뒤)를 보인다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const pending: Order = {
      ...paidOrder(3000),
      status: 'HOLD_PENDING',
      progress: null,
      processingStatus: 'PROCESSING',
      paidAt: null,
    }
    const created = mockCreateOrder(pending)
    const { pay } = await openWithCoupon()
    await userEvent.click(pay)

    expect(
      await screen.findByRole('heading', { name: '결제를 처리하고 있어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText('주문 금액').nextSibling).toHaveTextContent(
      '27,000 HP',
    )
    created.orders()!.set(paidOrder(3000))
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(
      await screen.findByRole('heading', { name: '주문을 마쳤어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText('결제한 HP').nextSibling).toHaveTextContent(
      '27,000 HP',
    )
  })
})

describe('쿠폰 할인 계산 실패', () => {
  it('미리보기가 실패하면(503) 정가로 결제된다고 알리고 쿠폰 없이 결제한다. 다시 계산할 수 있다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
      failNext: {
        'POST /coupons/me/quote': orderProblem(
          503,
          'LECTURE_CATALOG_UNAVAILABLE',
        ),
      },
    })
    const created = mockCreateOrder(paidOrder(0), paidOrder(3000))
    const dialog = await openCheckout()

    const alert = await within(dialog).findByText(
      /쿠폰을 확인할 수 없어 정가로 결제돼요/,
    )
    expect(alert).toHaveTextContent('쿠폰 할인을 계산하지 못했어요.')
    // 실패한 미리보기는 저절로 다시 부르지 않는다
    expect(coupons.quoteRequests).toHaveLength(1)
    // 정가로, 쿠폰 없이 결제한다
    await userEvent.click(
      within(dialog).getByRole('button', { name: '쿠폰 없이 30,000 HP 결제' }),
    )
    await waitFor(() => expect(created.bodies).toEqual([{ lectureIds: [7] }]))
  })

  it('다시 계산하면 할인이 적용된다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
      failNext: {
        'POST /coupons/me/quote': orderProblem(
          503,
          'LECTURE_CATALOG_UNAVAILABLE',
        ),
      },
    })
    const dialog = await openCheckout()
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '다시 계산' }),
    )
    expect(
      await within(dialog).findByRole('button', { name: '27,000 HP 결제' }),
    ).toBeEnabled()
  })

  it('강의 수가 많아 쿠폰을 쓸 수 없으면(400 COUPON_TOO_MANY_ITEMS) 그 이유를 보이고 쿠폰 없이 결제한다', async () => {
    mockLectureDetail()
    mockCoupons({
      failNext: {
        'POST /coupons/me/quote': orderProblem(400, 'COUPON_TOO_MANY_ITEMS'),
      },
    })
    const dialog = await openCheckout()
    expect(
      await within(dialog).findByText(
        /한 번에 쿠폰을 쓸 수 있는 강의 수를 넘었어요\./,
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '쿠폰 없이 30,000 HP 결제' }),
    ).toBeEnabled()
  })

  it('직접 고른 쿠폰을 미리보기가 거절하면(409, memberCouponId) 그 쿠폰 옆에 사유를 보인다', async () => {
    mockLectureDetail()
    const second = memberCoupon({
      memberCouponId: 12,
      couponId: 2,
      couponName: '3천 HP 할인',
      stackable: true,
    })
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon, second] },
      quotes: [
        quoteFor({ 11: { discount: 3000 }, 12: { discount: 3000 } }, [11]),
      ],
    })
    const dialog = await openCheckout()
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    coupons.failNext['POST /coupons/me/quote'] = orderProblem(
      409,
      'COUPON_NOT_APPLICABLE',
      { memberCouponId: 12 },
    )
    await userEvent.click(
      await within(dialog).findByRole('radio', { name: /3천 HP 할인/ }),
    )
    expect(
      await within(dialog).findByText('3천 HP 할인:', {
        exact: false,
        selector: 'b',
      }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('radio', {
        name: /3천 HP 할인.*이 강의에 쓸 수 없는 쿠폰이에요/,
      }),
    ).toBeInTheDocument()
    // 추천으로 돌아가거나 쿠폰 없이 결제할 수 있다
    expect(
      within(dialog).getByRole('button', { name: '추천으로 돌아가기' }),
    ).toBeEnabled()
  })

  it('쓸 수 있는 쿠폰 목록을 못 불러오면 그 자리에서 다시 불러올 수 있다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
    })
    let failOnce = true
    server.use(
      http.get('*/api/v1/coupons/me/usable', () => {
        if (!failOnce) return undefined
        failOnce = false
        return orderProblem(400, 'BAD_REQUEST')
      }),
    )
    const dialog = await openCheckout()
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    expect(
      await within(dialog).findByText(/쓸 수 있는 쿠폰을 불러오지 못했어요/),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '다시 시도' }),
    )
    expect(
      await within(dialog).findByRole('radio', { name: /가을맞이 10% 할인/ }),
    ).toBeInTheDocument()
  })

  it('쿠폰 종류를 확인하지 못한 쿠폰은 어느 칸에도 넣지 않고 알린다', async () => {
    mockLectureDetail()
    mockCoupons({
      // 종류가 없는 응답 + 쿠폰 상세도 없음(404)
      usable: { 7: [{ ...sellerCoupon, couponType: undefined }] },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
    })
    const dialog = await openCheckout()
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    expect(
      await within(dialog).findByText(
        /쿠폰 종류를 확인하지 못해 고를 수 없어요: 가을맞이 10% 할인/,
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('radio', { name: /가을맞이 10% 할인/ }),
    ).not.toBeInTheDocument()
  })
})

describe('잔액과 쿠폰 할인', () => {
  /** 미리보기 응답을 붙잡아 두었다가 release()로 흉내 BE에 넘긴다 */
  function holdQuotes() {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/v1/coupons/me/quote', async () => {
        await gate
      }),
    )
    return () => release()
  }

  it('잔액이 할인 뒤 금액만큼이면 계산하는 동안 충전을 권하지 않고, 계산이 끝나면 결제할 수 있다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [quoteFor({ 11: { discount: 3000 } }, [11])],
    })
    const release = holdQuotes()
    renderApp('/lectures/7', 'USER', { availableTotalHp: 27000 })
    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    expect(
      await within(dialog).findByRole('button', { name: '할인 계산 중…' }),
    ).toBeDisabled()
    expect(
      within(dialog).queryByRole('link', { name: 'HP 충전하러 가기' }),
    ).not.toBeInTheDocument()
    release()
    expect(
      await within(dialog).findByRole('button', { name: '27,000 HP 결제' }),
    ).toBeEnabled()
  })

  it('잔액이 0이어도 100% 쿠폰이면 0 HP로 결제할 수 있다', async () => {
    mockLectureDetail()
    mockCoupons({
      usable: { 7: [sellerCoupon] },
      quotes: [quoteFor({ 11: { discount: 30000 } }, [11])],
    })
    const created = mockCreateOrder(paidOrder(30000))
    renderApp('/lectures/7', 'USER', {
      availableTotalHp: 0,
      revenueBalanceHp: 0,
    })
    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '0 HP 결제' }),
    )
    await waitFor(() =>
      expect(created.bodies[0]).toEqual({
        lectureIds: [7],
        coupons: [{ memberCouponId: 11, lectureId: 7 }],
        expectedBuyerAmountHp: 0,
      }),
    )
  })

  it('직접 고르는 동안 다시 계산하면 직전 결제액을 유지하고 결제는 막는다', async () => {
    mockLectureDetail()
    const second = memberCoupon({
      memberCouponId: 12,
      couponId: 2,
      couponName: '5천 HP 할인',
      stackable: true,
    })
    mockCoupons({
      usable: { 7: [sellerCoupon, second] },
      quotes: [
        quoteFor({ 11: { discount: 3000 }, 12: { discount: 5000 } }, [11]),
      ],
    })
    renderApp('/lectures/7', 'USER', { availableTotalHp: 27000 })
    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    await within(dialog).findByRole('button', { name: '27,000 HP 결제' })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '쿠폰 직접 고르기' }),
    )
    const release = holdQuotes()
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /5천 HP 할인/ }),
    )
    expect(
      await within(dialog).findByRole('button', { name: '할인 계산 중…' }),
    ).toBeDisabled()
    expect(within(dialog).getByText('결제할 HP').nextSibling).toHaveTextContent(
      '27,000 HP',
    )
    expect(
      within(dialog).queryByRole('link', { name: 'HP 충전하러 가기' }),
    ).not.toBeInTheDocument()
    release()
    expect(
      await within(dialog).findByRole('button', { name: '25,000 HP 결제' }),
    ).toBeEnabled()
  })
})

describe('추천 모드 주문 거절 뒤 다시 추천', () => {
  it('추천에 플랫폼 쿠폰이 섞여 뺀 매핑으로 주문했다가 거절되면, 추천을 다시 받아 거절된 쿠폰이 빠진 결과로 계산한다', async () => {
    mockLectureDetail()
    const second = memberCoupon({
      memberCouponId: 12,
      couponId: 2,
      couponName: '2천 HP 할인',
      stackable: true,
    })
    const discount: Record<number, number> = { 11: 3000, 12: 2000, 21: 1000 }
    let recommendCalls = 0
    const coupons = mockCoupons({
      usable: { 7: [sellerCoupon, second] },
      quotes: [
        ({ selections }: QuoteRequest) => {
          // 처음 추천은 판매자 쿠폰 11 + 플랫폼 쿠폰 21, 쿠폰 11이 쓰인 뒤의 추천은 12 + 21
          if (selections === null) recommendCalls++
          const ids =
            selections?.map((s) => s.memberCouponId) ??
            (recommendCalls === 1 ? [11, 21] : [12, 21])
          return couponQuote(
            [
              {
                lectureId: 7,
                price: 30000,
                coupons: ids.map((id) =>
                  quoteCoupon({
                    memberCouponId: id,
                    couponType: id === 21 ? 'PLATFORM' : 'SELLER',
                    discount: discount[id],
                  }),
                ),
              },
            ],
            { recommended: selections === null, optimal: true },
          )
        },
      ],
    })
    const created = mockCreateOrder(
      orderProblem(409, 'COUPON_CALCULATION_REJECTED', {
        couponCode: 'COUPON_NOT_USABLE',
        memberCouponId: 11,
      }),
    )
    const dialog = await openCheckout()
    // 플랫폼 쿠폰을 뺀 매핑(쿠폰 11)으로 계산해 주문한다
    const pay = await within(dialog).findByRole('button', {
      name: '27,000 HP 결제',
    })
    const before = coupons.quoteRequests.length
    await userEvent.click(pay)
    expect(created.bodies[0]?.coupons).toEqual([
      { memberCouponId: 11, lectureId: 7 },
    ])

    // 추천을 다시 받아(쿠폰 12 + 21) 플랫폼 쿠폰을 뺀 쿠폰 12로 계산한다. 정가 결제로 떨어지지 않는다
    expect(
      await within(dialog).findByRole('button', { name: '28,000 HP 결제' }),
    ).toBeEnabled()
    expect(coupons.quoteRequests.slice(before)).toEqual([
      { lectureIds: [7], selections: null },
      { lectureIds: [7], selections: [{ memberCouponId: 12, lectureId: 7 }] },
    ])
    expect(
      within(dialog).queryByText(/쿠폰을 확인할 수 없어 정가로 결제돼요/),
    ).not.toBeInTheDocument()
  })
})
