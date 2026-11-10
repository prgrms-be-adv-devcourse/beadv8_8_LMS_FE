import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Order, OrderItem, OrderStatus } from '@/entities/order/types'
import { mockOrders } from '@/test/lectureOrders'
import { renderApp } from '@/test/renderApp'

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
