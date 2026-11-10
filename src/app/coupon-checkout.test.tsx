import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('직접 고른 매핑으로 다시 계산하고, 추천으로 돌아갈 수 있다. 종류는 쿠폰 상세에서 한 번만 가져온다', async () => {
    mockLectureDetail()
    const coupons = mockCoupons({
      // 회원 쿠폰 목록에 종류가 없으면(BE 선행 작업 전) 쿠폰 상세의 type으로 칸을 나눈다
      usable: { 7: [sellerCoupon, second] },
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
