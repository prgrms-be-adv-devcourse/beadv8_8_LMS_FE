import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Sale } from '@/entities/lecture/types'
import type { Order, OrderItem, OrderStatus } from '@/entities/order/types'
import { mockOrders } from '@/test/lectureOrders'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

afterEach(() => queryClient.clear())

const orderItem = (patch: Partial<OrderItem>): OrderItem => ({
  orderItemId: 701,
  lectureId: 7,
  lectureTitle: '첫 방송 세팅',
  priceHp: 30000,
  discountHp: 0,
  buyerAmountHp: 30000,
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
  ...patch,
})

/**
 * 쿠폰을 쓴 주문 700: 강의 7(30,000 HP, 3,000 HP 할인 → 27,000 HP)과 강의 8(20,000 HP, 할인 없음).
 * 할인 전 합 50,000, 할인 합 3,000, 결제액 47,000
 */
function discountedOrder(status: OrderStatus = 'PAID'): Order {
  const paid = status === 'PAID'
  const items = [
    orderItem({ discountHp: 3000, buyerAmountHp: 27000 }),
    orderItem({
      orderItemId: 702,
      lectureId: 8,
      lectureTitle: '드럼 입문',
      priceHp: 20000,
      buyerAmountHp: 20000,
    }),
  ].map((item) =>
    paid
      ? item
      : {
          ...item,
          status,
          purchasedAt: null,
          autoConfirmAt: null,
          payoutScheduledAt: null,
        },
  )
  return {
    orderId: 700,
    totalAmountHp: 50000,
    discountHp: 3000,
    buyerAmountHp: 47000,
    status,
    progress: paid ? 'IN_PROGRESS' : null,
    processingStatus: null,
    orderedAt: '2026-11-10T10:00:00',
    paidAt: paid ? '2026-11-10T10:00:00' : null,
    canceledAt: null,
    items,
  }
}

describe('쿠폰을 쓴 주문의 금액', () => {
  it('주문 완료는 항목별 가격·할인·결제액과 결제한 HP(할인 뒤)를 보인다', async () => {
    mockOrders(discountedOrder())
    renderApp('/library/orders/700/done', 'USER')

    expect(
      await screen.findByRole('heading', { name: '주문을 마쳤어요' }),
    ).toBeInTheDocument()
    const discounted = screen.getByRole('group', { name: '첫 방송 세팅 금액' })
    expect(discounted).toHaveTextContent('30,000')
    expect(discounted).toHaveTextContent('쿠폰 할인−3,000')
    expect(discounted).toHaveTextContent('결제액27,000')
    // 할인 없는 항목은 가격 한 줄만
    expect(
      screen.queryByRole('group', { name: '드럼 입문 금액' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('쿠폰 할인 합').nextSibling).toHaveTextContent(
      '−3,000',
    )
    // 결제한 HP는 할인 전 합(50,000)이 아니라 결제액
    expect(screen.getByText('결제한 HP').nextSibling).toHaveTextContent(
      '47,000 HP',
    )
  })

  it('쿠폰을 쓴 주문이 결제 실패로 끝나면 쿠폰을 다시 골라 주문하라고 덧붙인다', async () => {
    mockOrders(discountedOrder('HOLD_FAILED'))
    renderApp('/library/orders/700/done', 'USER')

    expect(
      await screen.findByRole('heading', { name: '결제하지 못했어요' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /잔액을 확인하고 다시 주문해 주세요\. 쿠폰을 다시 골라 주문해 주세요\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('주문 금액').nextSibling).toHaveTextContent(
      '47,000 HP',
    )
  })

  it('주문 내역 카드는 상세를 받으면 결제액과 할인을 머리에, 항목에 가격·할인·결제액을 보인다', async () => {
    mockOrders(discountedOrder())
    renderApp('/library/orders', 'USER')

    const card = await screen.findByRole('region', { name: '주문 번호 700' })
    expect(await within(card).findByText('47,000 HP')).toBeInTheDocument()
    expect(within(card).getByText('3,000 HP 할인')).toBeInTheDocument()
    expect(
      within(card).getByText('30,000 HP · 3,000 HP 할인 · 결제 27,000 HP'),
    ).toBeInTheDocument()
    expect(within(card).getByText('20,000 HP')).toBeInTheDocument()
  })

  it('주문 상세가 오기 전과 실패하면 카드 머리에 할인 전 합임을 밝히고 굵게 보이지 않는다', async () => {
    mockOrders(discountedOrder())
    // 상세를 붙잡아 두었다가 실패시킨다(4xx라 다시 시도하지 않는다)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/lectures/orders/700', async () => {
        await gate
        return HttpResponse.json(
          { status: 400, code: 'BAD_REQUEST', detail: '실패' },
          { status: 400 },
        )
      }),
    )
    renderApp('/library/orders', 'USER')

    const card = await screen.findByRole('region', { name: '주문 번호 700' })
    const pending = within(card).getByText('주문 금액(할인 전) 50,000 HP')
    expect(pending.tagName).not.toBe('B')
    expect(within(card).queryByText('47,000 HP')).not.toBeInTheDocument()

    release()
    expect(
      await within(card).findByText('불러오지 못했어요'),
    ).toBeInTheDocument()
    expect(
      within(card).getByText('주문 금액(할인 전) 50,000 HP').tagName,
    ).not.toBe('B')
  })

  it('쿠폰을 쓴 결제 실패 주문은 내역 카드에도 쿠폰을 다시 고르라고 한다', async () => {
    mockOrders(discountedOrder('HOLD_FAILED'))
    renderApp('/library/orders', 'USER')

    const card = await screen.findByRole('region', { name: '주문 번호 700' })
    expect(
      await within(card).findByText(
        '결제하지 못한 주문이에요 · 묶인 HP 없음 · 쿠폰을 다시 골라 주문해 주세요.',
      ),
    ).toBeInTheDocument()
  })

  it('주문 내역의 구매 취소는 결제액(할인 뒤)을 돌려받는 HP로 보인다', async () => {
    mockOrders(discountedOrder())
    renderApp('/library/orders', 'USER')

    const card = await screen.findByRole('region', { name: '주문 번호 700' })
    const [first] = await within(card).findAllByRole('button', {
      name: '구매 취소',
    })
    await userEvent.click(first)
    const dialog = await screen.findByRole('dialog', {
      name: '구매를 취소할까요?',
    })
    expect(
      within(dialog).getByText('돌려받는 HP').nextSibling,
    ).toHaveTextContent('27,000 HP')
  })

  it('내 강의의 구매 취소도 결제액(할인 뒤)을 돌려받는 HP로 보인다', async () => {
    mockOrders(discountedOrder())
    renderApp('/library', 'USER')

    // 내 강의 행에는 이름 붙은 역할이 없어 제목이 든 행을 찾는다.
    const course = (
      await screen.findByText('첫 방송 세팅', { selector: '.row-title' })
    ).closest('.row-item') as HTMLElement
    await userEvent.click(
      await within(course).findByRole('button', { name: '구매 취소' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '구매를 취소할까요?',
    })
    expect(await within(dialog).findByText('27,000 HP')).toBeInTheDocument()
  })
})

const sale = (patch: Partial<Sale>): Sale => ({
  orderItemId: 1,
  lectureId: 7,
  lectureTitle: '첫 방송 세팅',
  priceHp: 30000,
  discountHp: 0,
  sellerDiscountHp: 0,
  platformDiscountHp: 0,
  sellerPayoutHp: 30000,
  status: 'PURCHASED',
  purchasedAt: '2026-11-10T10:00:00',
  payoutScheduledAt: '2026-12-11T00:00:00',
  paidOutAt: null,
  objectionStatus: 'NONE',
  ...patch,
})

const page = <T,>(content: T[]) => ({
  content,
  page: { size: 20, number: 0, totalElements: content.length, totalPages: 1 },
})

function serveSales(sales: Sale[]) {
  server.use(
    http.get('*/api/v1/lectures/me', () => rs(page([]))),
    http.get('*/api/v1/lectures/sales', () => rs(page(sales))),
  )
}

describe('판매자 판매 내역의 쿠폰 할인', () => {
  it('원가격·할인(판매자·플랫폼 부담)·지급액을 보이고, 플랫폼 부담은 지급액에서 빠지지 않는다고 안내한다', async () => {
    serveSales([
      // 판매자 쿠폰 3,000 + 플랫폼 쿠폰 1,500: 지급액은 가격 − 판매자 부담
      sale({
        orderItemId: 1,
        discountHp: 4500,
        sellerDiscountHp: 3000,
        platformDiscountHp: 1500,
        sellerPayoutHp: 27000,
      }),
      sale({ orderItemId: 2, lectureId: 8, lectureTitle: '드럼 입문' }),
    ])
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const table = await screen.findByRole('table')
    const discounted = within(table).getByRole('row', { name: /첫 방송 세팅/ })
    const cells = within(discounted).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent('30,000')
    expect(cells[3]).toHaveTextContent('−4,500')
    expect(cells[3]).toHaveTextContent('판매자 부담 3,000 · 플랫폼 부담 1,500')
    expect(cells[4]).toHaveTextContent('27,000')

    const plain = within(table).getByRole('row', { name: /드럼 입문/ })
    expect(within(plain).getAllByRole('cell')[3]).toHaveTextContent(/^0$/)
    expect(within(plain).getAllByRole('cell')[4]).toHaveTextContent('30,000')

    expect(
      screen.getByText(/플랫폼 부담은 지급액에서 빠지지 않아요/),
    ).toBeInTheDocument()
  })

  it('할인 있는 판매가 없으면 부담 안내를 보이지 않는다', async () => {
    serveSales([sale({})])
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText(/플랫폼 부담은/)).not.toBeInTheDocument()
  })
})
