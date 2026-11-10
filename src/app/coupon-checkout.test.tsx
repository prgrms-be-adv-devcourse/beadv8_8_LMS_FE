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
