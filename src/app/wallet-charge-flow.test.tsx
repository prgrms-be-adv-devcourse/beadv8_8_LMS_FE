import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { CartItem } from '@/entities/cart/types'
import type { ChargeOrder, Wallet } from '@/entities/wallet/types'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

// 토스페이먼츠 SDK는 실제 결제창 스크립트를 받아 오므로 가짜로 바꾼다.
const toss = vi.hoisted(() => {
  const requestPayment = vi.fn()
  const payment = vi.fn(() => ({ requestPayment }))
  const loadTossPayments = vi.fn(async () => ({ payment }))
  return { requestPayment, payment, loadTossPayments }
})
vi.mock('@tosspayments/tosspayments-sdk', () => ({
  loadTossPayments: toss.loadTossPayments,
}))
// 승인 결과 확인(2초 × 15번)을 테스트에서는 짧게 돈다.
vi.mock('@/entities/wallet/charge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/wallet/charge')>()),
  CHARGE_POLL_INTERVAL_MS: 20,
}))

const CLIENT_KEY = 'test_ck_dummy'

const order = (patch: Partial<ChargeOrder> = {}): ChargeOrder => ({
  orderId: 'HPCHG-0f8fad5bd9cb469fa16570867728950e',
  orderName: 'HP 30,000 충전',
  amount: 30000,
  status: 'PENDING',
  requestedAt: '2026-10-16T01:00:00Z',
  completedAt: null,
  failedAt: null,
  failureReason: null,
  ...patch,
})

const problem = (status: number, code: string, extra = {}) =>
  HttpResponse.json(
    { status, code, detail: `${code} 상세`, ...extra },
    { status },
  )

/** 충전 주문 생성 요청 본문을 모은다. */
function mockCreateOrder(
  respond: (amount: number) => Response = (amount) =>
    rs(order({ amount, orderName: `HP ${amount.toLocaleString()} 충전` }), 201),
) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/api/v1/wallets/charges', async ({ request }) => {
      const body = (await request.json()) as { amount: number }
      bodies.push(body)
      return respond(body.amount)
    }),
  )
  return bodies
}

beforeEach(() => {
  vi.stubEnv('VITE_TOSS_PAYMENTS_CLIENT_KEY', CLIENT_KEY)
  toss.requestPayment.mockReset().mockResolvedValue(undefined)
  toss.payment.mockClear()
  toss.loadTossPayments.mockClear()
  document.cookie = 'XSRF-TOKEN=t'
})

afterEach(() => {
  vi.unstubAllEnvs()
  queryClient.clear()
})

describe('지갑', () => {
  it('지갑에서 보유 HP와 충전·수익 HP, 보류 HP를 보여 준다', async () => {
    renderApp('/wallet', 'INFLUENCER', {
      chargeBalanceHp: 120000,
      revenueBalanceHp: 43000,
      availableTotalHp: 163000,
      heldChargeHp: 5000,
      heldRevenueHp: 7000,
      heldTotalHp: 12000,
    })

    const own = await screen.findByRole('region', { name: '보유 HP' })
    expect(await within(own).findByText('163,000')).toBeInTheDocument()
    expect(within(own).getByText('충전 HP').closest('div')).toHaveTextContent(
      '120,000',
    )
    expect(within(own).getByText('수익 HP').closest('div')).toHaveTextContent(
      '43,000',
    )

    const held = screen.getByRole('region', { name: '보류 중' })
    expect(within(held).getByText('12,000')).toBeInTheDocument()
    expect(
      within(held).getByText('충전 보류').closest('div'),
    ).toHaveTextContent('5,000')
    expect(
      within(held).getByText('수익 보류').closest('div'),
    ).toHaveTextContent('7,000')
  })

  it('유저 지갑은 수익 HP 없이 충전 HP만 보여 준다', async () => {
    renderApp('/wallet', 'USER', {
      chargeBalanceHp: 8000,
      revenueBalanceHp: 0,
      availableTotalHp: 8000,
      heldChargeHp: 2000,
      heldRevenueHp: 0,
      heldTotalHp: 2000,
    })

    const own = await screen.findByRole('region', { name: '보유 HP' })
    expect(within(own).getByText('충전 HP')).toBeInTheDocument()
    expect(within(own).queryByText('수익 HP')).not.toBeInTheDocument()
    const held = screen.getByRole('region', { name: '보류 중' })
    expect(within(held).getByText('충전 보류')).toBeInTheDocument()
    expect(within(held).queryByText('수익 보류')).not.toBeInTheDocument()
  })

  it('결제 설정(클라이언트 키)이 없으면 충전 버튼을 끄고 안내한다', async () => {
    vi.stubEnv('VITE_TOSS_PAYMENTS_CLIENT_KEY', '')
    renderApp('/wallet', 'USER')

    expect(await screen.findByRole('button', { name: '충전' })).toBeDisabled()
    expect(screen.getByText(/결제 설정이 없어요/)).toBeInTheDocument()
  })
})

describe('충전 모달', () => {
  async function openChargeModal() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '충전' }))
    return { user, dialog: screen.getByRole('dialog', { name: 'HP 충전' }) }
  }

  it('충전 금액이 1,000원 단위가 아니면 결제할 수 없다', async () => {
    renderApp('/wallet', 'USER')
    const { user, dialog } = await openChargeModal()
    const input = within(dialog).getByLabelText('충전 금액 (원)')

    await user.clear(input)
    await user.type(input, '1500')
    expect(
      within(dialog).getByText('1,000원 단위로 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '1,500원 결제하기' }),
    ).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: '50,000' }))
    expect(input).toHaveValue('50000')
    expect(
      within(dialog).getByRole('button', { name: '50,000원 결제하기' }),
    ).toBeEnabled()
  })

  it('결제하기를 누르면 충전 주문을 만들고 그 주문으로 결제창을 연다', async () => {
    const bodies = mockCreateOrder()
    renderApp('/wallet', 'USER')
    const { user, dialog } = await openChargeModal()

    await user.click(
      within(dialog).getByRole('button', { name: '30,000원 결제하기' }),
    )

    await waitFor(() => expect(toss.requestPayment).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ amount: 30000 }])
    expect(toss.loadTossPayments).toHaveBeenCalledWith(CLIENT_KEY)
    expect(toss.payment).toHaveBeenCalledWith({
      customerKey: `hapbang-member-${ME_ID}`,
    })
    const origin = window.location.origin
    expect(toss.requestPayment).toHaveBeenCalledWith({
      method: 'CARD',
      amount: { currency: 'KRW', value: 30000 },
      orderId: order().orderId,
      orderName: 'HP 30,000 충전',
      successUrl: `${origin}/wallet/charge/result`,
      failUrl: `${origin}/wallet/charge/result?amount=30000`,
    })
  })

  it('지갑이 없으면(WALLET_NOT_FOUND) 지갑을 불러온 뒤 주문을 다시 만든다', async () => {
    let created = 0
    const bodies = mockCreateOrder((amount) =>
      created++ === 0
        ? problem(404, 'WALLET_NOT_FOUND')
        : rs(order({ amount }), 201),
    )
    let walletCalls = 0
    renderApp('/wallet', 'USER', () => {
      walletCalls += 1
      return rs({
        walletId: 1,
        chargeBalanceHp: 0,
        revenueBalanceHp: 0,
        heldChargeHp: 0,
        heldRevenueHp: 0,
        availableTotalHp: 0,
        heldTotalHp: 0,
      })
    })
    const { user, dialog } = await openChargeModal()
    const before = walletCalls

    await user.click(
      within(dialog).getByRole('button', { name: '30,000원 결제하기' }),
    )

    await waitFor(() => expect(toss.requestPayment).toHaveBeenCalledTimes(1))
    expect(bodies).toHaveLength(2)
    expect(walletCalls).toBeGreaterThan(before)
  })

  it('충전을 쓸 수 없으면(CHARGE_UNAVAILABLE) 지금은 충전할 수 없다고 안내한다', async () => {
    mockCreateOrder(() => problem(503, 'CHARGE_UNAVAILABLE'))
    renderApp('/wallet', 'USER')
    const { user, dialog } = await openChargeModal()

    await user.click(
      within(dialog).getByRole('button', { name: '30,000원 결제하기' }),
    )

    expect(
      await within(dialog).findByText(/지금은 충전할 수 없어요/),
    ).toBeInTheDocument()
    expect(toss.requestPayment).not.toHaveBeenCalled()
  })

  it('결제창을 닫으면 모달에 남아 결제를 취소했다고 안내한다', async () => {
    mockCreateOrder()
    toss.requestPayment.mockRejectedValue({
      code: 'USER_CANCEL',
      message: '취소되었습니다.',
    })
    renderApp('/wallet', 'USER')
    const { user, dialog } = await openChargeModal()

    await user.click(
      within(dialog).getByRole('button', { name: '30,000원 결제하기' }),
    )

    const notice = await within(dialog).findByText(/결제를 취소했어요/)
    expect(notice.closest('.notice')).not.toHaveClass('bad')
    expect(
      within(dialog).getByRole('button', { name: '30,000원 결제하기' }),
    ).toBeEnabled()
  })

  it('결제창 오류는 모달 안에 보여 준다', async () => {
    mockCreateOrder()
    toss.requestPayment.mockRejectedValue({
      code: 'INVALID_PARAMETERS',
      message: '잘못된 요청입니다.',
    })
    renderApp('/wallet', 'USER')
    const { user, dialog } = await openChargeModal()

    await user.click(
      within(dialog).getByRole('button', { name: '30,000원 결제하기' }),
    )

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('결제창을 열지 못했어요')
    expect(alert).toHaveTextContent('잘못된 요청입니다.')
  })

  it('주소의 charge 금액으로 충전 모달을 연다', async () => {
    const router = renderApp('/wallet?charge=6000', 'USER')

    const dialog = await screen.findByRole('dialog', { name: 'HP 충전' })
    expect(within(dialog).getByLabelText('충전 금액 (원)')).toHaveValue('6000')
    // 새로고침해도 다시 열리지 않게 주소에서 지운다
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('주소의 charge 값이 충전 금액이 아니면 모달을 열지 않는다', async () => {
    const router = renderApp('/wallet?charge=1500', 'USER')

    expect(await screen.findByRole('button', { name: '충전' })).toBeEnabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })
})

describe('충전 결과', () => {
  const ORDER_ID = order().orderId
  const SUCCESS = `/wallet/charge/result?paymentType=NORMAL&orderId=${ORDER_ID}&paymentKey=pk_test_1&amount=30000`
  const wallet = (availableTotalHp: number): Wallet => ({
    walletId: 1,
    chargeBalanceHp: availableTotalHp,
    revenueBalanceHp: 0,
    heldChargeHp: 0,
    heldRevenueHp: 0,
    availableTotalHp,
    heldTotalHp: 0,
  })

  function mockCart(items: Partial<CartItem>[] = []) {
    server.use(
      http.get('*/api/v1/lectures/cart', () =>
        rs({
          items: items.map((item, i) => ({
            lectureId: i + 1,
            title: `강의 ${i + 1}`,
            priceHp: 10000,
            thumbnailUrl: null,
            purchasable: true,
            ...item,
          })),
          purchasableTotalHp: items.length * 10000,
        }),
      ),
    )
  }

  /** 승인 요청 본문을 모은다. 승인되면 balance를 충전 뒤 잔액으로 바꾼다. */
  function mockConfirm(respond: () => Response, onConfirm?: () => void) {
    const bodies: unknown[] = []
    server.use(
      http.post('*/api/v1/wallets/charges/confirm', async ({ request }) => {
        bodies.push(await request.json())
        onConfirm?.()
        return respond()
      }),
    )
    return bodies
  }

  /** 주문 상태 조회 응답을 차례로 준다(마지막 응답을 계속 쓴다). */
  function mockChargeStatus(...orders: ChargeOrder[]) {
    const calls: string[] = []
    server.use(
      http.get('*/api/v1/wallets/charges/:orderId', ({ params }) => {
        calls.push(String(params.orderId))
        return rs(orders[Math.min(calls.length, orders.length) - 1])
      }),
    )
    return calls
  }

  it('성공 리다이렉트로 오면 승인을 요청하고 충전 완료와 보유 HP·주문 번호를 보여 준다', async () => {
    mockCart()
    let balance = 8000
    const bodies = mockConfirm(
      () => rs(order({ status: 'COMPLETED' })),
      () => (balance = 38000),
    )
    renderApp(SUCCESS, 'USER', () => rs(wallet(balance)))

    expect(
      await screen.findByRole('heading', { name: '30,000 HP를 충전했어요' }),
    ).toBeInTheDocument()
    expect(bodies).toEqual([
      { paymentKey: 'pk_test_1', orderId: ORDER_ID, amount: 30000 },
    ])
    expect(screen.getByText('주문 번호').closest('.row')).toHaveTextContent(
      ORDER_ID,
    )
    await waitFor(() =>
      expect(screen.getByText('보유 HP').closest('.row')).toHaveTextContent(
        '38,000 HP',
      ),
    )
    // 헤더 HP도 새 잔액으로 바뀐다
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: '지갑' }),
    ).toHaveTextContent('38,000')
    expect(screen.getByRole('link', { name: '지갑으로' })).toHaveClass(
      'primary',
    )
    expect(
      screen.queryByRole('link', { name: '장바구니로' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('테스트 결제라 실제 금액은 청구되지 않아요.'),
    ).toBeInTheDocument()
  })

  it('장바구니에 강의가 있으면 장바구니로를 먼저 보여 준다', async () => {
    mockCart([{}])
    mockConfirm(() => rs(order({ status: 'COMPLETED' })))
    renderApp(SUCCESS, 'USER')

    const toCart = await screen.findByRole('link', { name: '장바구니로' })
    expect(toCart).toHaveClass('primary')
    expect(toCart).toHaveAttribute('href', '/cart')
    expect(screen.getByRole('link', { name: '지갑으로' })).not.toHaveClass(
      'primary',
    )
  })

  it('승인 결과를 확인 중(202)이면 주문 상태를 다시 확인해 완료를 보여 준다', async () => {
    mockCart()
    mockConfirm(() => rs(order({ status: 'PROCESSING' }), 202))
    const calls = mockChargeStatus(
      order({ status: 'PROCESSING' }),
      order({ status: 'COMPLETED' }),
    )
    renderApp(SUCCESS, 'USER')

    expect(
      await screen.findByRole('heading', { name: '결제를 확인하고 있어요' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '30,000 HP를 충전했어요' }),
    ).toBeInTheDocument()
    expect(calls).toEqual([ORDER_ID, ORDER_ID])
  })

  it('확인이 계속 늦어지면 지갑에서 다시 확인하라고 안내한다', async () => {
    mockConfirm(() => rs(order({ status: 'PROCESSING' }), 202))
    const calls = mockChargeStatus(order({ status: 'PROCESSING' }))
    renderApp(SUCCESS, 'USER')

    expect(
      await screen.findByRole('heading', { name: '확인이 늦어지고 있어요' }),
    ).toBeInTheDocument()
    expect(calls).toHaveLength(15)
    expect(screen.getByRole('link', { name: '지갑으로' })).toBeInTheDocument()
    // 그 뒤로는 다시 부르지 않는다
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls).toHaveLength(15)
  })

  it('확인 중 실패로 끝나면(FAILED) 실패 사유를 보여 준다', async () => {
    mockConfirm(() => rs(order({ status: 'PROCESSING' }), 202))
    mockChargeStatus(
      order({
        status: 'FAILED',
        failureReason: 'REJECT_CARD_PAYMENT: 한도 초과',
      }),
    )
    renderApp(SUCCESS, 'USER')

    expect(
      await screen.findByRole('heading', { name: '결제가 승인되지 않았어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/한도 초과/)).toBeInTheDocument()
    expect(screen.getByText('실패 코드').closest('.row')).toHaveTextContent(
      'REJECT_CARD_PAYMENT',
    )
  })

  it('승인이 거절되면 오류 코드와 PG 코드를 보여 주고 같은 금액으로 다시 결제할 수 있다', async () => {
    mockConfirm(() =>
      problem(400, 'CHARGE_PAYMENT_REJECTED', {
        detail: '한도 초과',
        pgCode: 'REJECT_CARD_PAYMENT',
      }),
    )
    const router = renderApp(SUCCESS, 'USER')

    expect(
      await screen.findByRole('heading', { name: '결제가 승인되지 않았어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/한도 초과/)).toBeInTheDocument()
    expect(screen.getByText('실패 코드').closest('.row')).toHaveTextContent(
      'CHARGE_PAYMENT_REJECTED',
    )
    expect(screen.getByText('PG 코드').closest('.row')).toHaveTextContent(
      'REJECT_CARD_PAYMENT',
    )

    await userEvent.click(screen.getByRole('link', { name: '다시 결제하기' }))
    const dialog = await screen.findByRole('dialog', { name: 'HP 충전' })
    expect(router.state.location.pathname).toBe('/wallet')
    expect(within(dialog).getByLabelText('충전 금액 (원)')).toHaveValue('30000')
  })

  it.each([
    [400, 'CHARGE_AMOUNT_MISMATCH'],
    [404, 'CHARGE_NOT_FOUND'],
    [409, 'CHARGE_PAYMENT_KEY_CONFLICT'],
    [409, 'CHARGE_ALREADY_FAILED'],
  ])(
    '승인 요청이 %i %s로 실패하면 실패 화면에 코드를 보여 준다',
    async (status, code) => {
      mockConfirm(() => problem(status, code))
      renderApp(SUCCESS, 'USER')

      expect(
        await screen.findByRole('heading', {
          name: '결제가 승인되지 않았어요',
        }),
      ).toBeInTheDocument()
      expect(screen.getByText('실패 코드').closest('.row')).toHaveTextContent(
        code,
      )
      expect(
        screen.getByRole('link', { name: '다시 결제하기' }),
      ).toHaveAttribute('href', '/wallet?charge=30000')
    },
  )

  function countChargeRequests() {
    let count = 0
    server.use(
      http.all('*/api/v1/wallets/charges*', () => {
        count += 1
        return HttpResponse.json(null, { status: 500 })
      }),
    )
    return () => count
  }

  it('결제창에서 취소하고 돌아오면 결제를 취소했다고 안내한다', async () => {
    const requests = countChargeRequests()
    renderApp(
      `/wallet/charge/result?amount=30000&code=PAY_PROCESS_CANCELED&message=${encodeURIComponent('사용자에 의해 결제가 취소되었습니다.')}&orderId=${ORDER_ID}`,
      'USER',
    )

    expect(
      await screen.findByRole('heading', { name: '결제를 취소했어요' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '결제창을 닫아 충전하지 않았어요. 결제 금액은 청구되지 않아요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '다시 결제하기' })).toHaveAttribute(
      'href',
      '/wallet?charge=30000',
    )
    expect(requests()).toBe(0)
  })

  it('결제가 승인되지 않고 돌아오면 코드와 메시지를 보여 준다', async () => {
    const requests = countChargeRequests()
    renderApp(
      `/wallet/charge/result?amount=30000&code=REJECT_CARD_COMPANY&message=${encodeURIComponent('카드사에서 거절했어요')}&orderId=${ORDER_ID}`,
      'USER',
    )

    expect(
      await screen.findByRole('heading', { name: '결제가 승인되지 않았어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/카드사에서 거절했어요/)).toBeInTheDocument()
    expect(screen.getByText('실패 코드').closest('.row')).toHaveTextContent(
      'REJECT_CARD_COMPANY',
    )
    expect(screen.getByText('결제 금액').closest('.row')).toHaveTextContent(
      '30,000원',
    )
    expect(requests()).toBe(0)
  })

  it('결과 쿼리가 없으면 지갑으로 보낸다', async () => {
    const router = renderApp('/wallet/charge/result', 'USER')

    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
  })
})
