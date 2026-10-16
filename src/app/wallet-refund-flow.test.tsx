import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Refund, Wallet } from '@/entities/wallet/types'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

// 처리 중 상태 확인(15초 × 24번)을 테스트에서는 짧게 돈다.
vi.mock('@/entities/wallet/refund', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/wallet/refund')>()),
  REFUND_POLL_INTERVAL_MS: 20,
}))

const REFUND_ID = 7

const refund = (patch: Partial<Refund> = {}): Refund => ({
  refundRequestId: REFUND_ID,
  requestedAmount: 12000,
  completedAmount: 0,
  returnedAmount: 0,
  pendingAmount: 0,
  status: 'COMPLETED',
  requestedAt: '2026-10-16T01:00:00Z',
  completedAt: null,
  canceledAt: null,
  items: [],
  ...patch,
})

const problem = (status: number, code: string) =>
  HttpResponse.json({ status, code, detail: `${code} 상세` }, { status })

/** 지갑 응답. 잔액을 바꾸면 다음 조회부터 바뀐 값을 준다(지갑을 다시 불러왔는지 확인용). */
function walletState(chargeBalanceHp: number) {
  const state = { chargeBalanceHp }
  const respond = () => {
    const wallet: Partial<Wallet> = {
      chargeBalanceHp: state.chargeBalanceHp,
      revenueBalanceHp: 0,
      availableTotalHp: state.chargeBalanceHp,
    }
    return rs({
      walletId: 1,
      heldChargeHp: 0,
      heldRevenueHp: 0,
      heldTotalHp: 0,
      ...wallet,
    })
  }
  return { state, respond }
}

/** 환불 신청 요청의 멱등키·본문을 모은다. */
function mockRequestRefund(
  respond: (amount: number, call: number) => Response | Promise<Response>,
) {
  const calls: { key: string | null; amount: number }[] = []
  server.use(
    http.post('*/api/v1/wallets/refunds', async ({ request }) => {
      const { amount } = (await request.json()) as { amount: number }
      calls.push({ key: request.headers.get('Idempotency-Key'), amount })
      return respond(amount, calls.length)
    }),
  )
  return calls
}

/** 환불 요청 조회 응답. 부를 때마다 respond에 몇 번째인지 넘긴다. */
function mockGetRefund(
  respond: (call: number) => Response | Promise<Response>,
) {
  let calls = 0
  server.use(
    http.get(`*/api/v1/wallets/refunds/${REFUND_ID}`, () => respond(++calls)),
  )
  return () => calls
}

/** 정해진 시간 동안 기다린다(조회가 멈췄는지 확인용). */
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

const ownCard = () => screen.getByRole('region', { name: '보유 HP' })

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=t'
})

afterEach(() => {
  queryClient.clear()
})

describe('환불 버튼', () => {
  it('충전 HP가 1,000 HP 미만이면 환불 버튼을 끈다', async () => {
    renderApp('/wallet', 'USER', {
      chargeBalanceHp: 999,
      availableTotalHp: 999,
    })
    expect(await screen.findByRole('button', { name: '환불' })).toBeDisabled()
  })

  it('충전 HP가 1,000 HP 이상이면 환불할 수 있다', async () => {
    renderApp('/wallet', 'USER', {
      chargeBalanceHp: 1000,
      availableTotalHp: 1000,
    })
    expect(await screen.findByRole('button', { name: '환불' })).toBeEnabled()
  })
})

async function openRefundModal() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '환불' }))
  return { user, dialog: screen.getByRole('dialog', { name: 'HP 환불' }) }
}

describe('환불 모달', () => {
  it('충전 HP 전액을 1,000 단위로 채우고 수익·보류 HP는 환불할 수 없다고 안내한다', async () => {
    renderApp('/wallet', 'INFLUENCER', {
      chargeBalanceHp: 12500,
      revenueBalanceHp: 43000,
      availableTotalHp: 55500,
    })
    const { dialog } = await openRefundModal()

    expect(within(dialog).getByLabelText('환불 금액 (HP)')).toHaveValue('12000')
    expect(
      within(dialog).getByText('충전 HP · 환불 가능').closest('div'),
    ).toHaveTextContent('12,500')
    expect(
      within(dialog)
        .getByText(/수익 HP · 환불 불가/)
        .closest('div'),
    ).toHaveTextContent('43,000')
    expect(
      within(dialog).getByText(/수익 HP와 거래에 보류된 HP는/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '12,000 HP 환불 신청' }),
    ).toBeEnabled()
  })

  it('유저 환불 모달에는 수익 HP가 없다', async () => {
    renderApp('/wallet', 'USER', { chargeBalanceHp: 5000, revenueBalanceHp: 0 })
    const { dialog } = await openRefundModal()
    expect(
      within(dialog).queryByText(/수익 HP · 환불 불가/),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['500', '최소 1,000 HP부터 환불할 수 있어요.'],
    ['1500', '1,000 HP 단위로 입력해 주세요.'],
    ['13000', '충전 HP(12,500)까지만 환불할 수 있어요.'],
  ])('금액이 %s HP면 신청할 수 없다', async (value, message) => {
    renderApp('/wallet', 'USER', { chargeBalanceHp: 12500 })
    const { user, dialog } = await openRefundModal()
    const input = within(dialog).getByLabelText('환불 금액 (HP)')

    await user.clear(input)
    await user.type(input, value)

    expect(within(dialog).getByRole('alert')).toHaveTextContent(message)
    expect(
      within(dialog).getByRole('button', { name: /HP 환불 신청$/ }),
    ).toBeDisabled()
  })
})

describe('환불 신청', () => {
  it('신청하면 멱등키와 금액을 보내고 완료 금액을 보여 준 뒤 지갑을 다시 불러온다', async () => {
    const wallet = walletState(12000)
    const calls = mockRequestRefund((amount) => {
      wallet.state.chargeBalanceHp -= amount
      return rs(refund({ requestedAmount: amount, completedAmount: amount }))
    })
    renderApp('/wallet', 'USER', wallet.respond)
    const { user, dialog } = await openRefundModal()

    await user.click(
      within(dialog).getByRole('button', { name: '12,000 HP 환불 신청' }),
    )

    expect(await within(dialog).findByText('환불 완료')).toBeInTheDocument()
    expect(
      within(dialog).getByText('환불한 금액').closest('div'),
    ).toHaveTextContent('12,000')
    expect(within(dialog).queryByText('충전 HP로 돌려준 금액')).toBeNull()
    expect(
      within(dialog).getByText(/결제 수단으로 돌려드렸어요/),
    ).toBeInTheDocument()
    expect(calls).toEqual([
      { key: expect.stringMatching(/^[\w-]{1,64}$/), amount: 12000 },
    ])
    await waitFor(() =>
      expect(
        within(ownCard()).getByText('충전 HP').closest('div'),
      ).toHaveTextContent(/^충전 HP0$/),
    )
  })

  it('응답을 받지 못하면 금액을 잠그고 같은 멱등키로 다시 시도한다', async () => {
    // 첫 요청은 접수돼 충전 HP가 보류됐는데 응답만 놓친 경우
    const wallet = walletState(12000)
    const calls = mockRequestRefund((amount, call) => {
      if (call === 1) {
        wallet.state.chargeBalanceHp = 0
        return HttpResponse.error()
      }
      if (call === 2) return problem(500, 'INTERNAL_ERROR')
      return rs(refund({ requestedAmount: amount, completedAmount: amount }))
    })
    renderApp('/wallet', 'USER', wallet.respond)
    const { user, dialog } = await openRefundModal()

    await user.click(
      within(dialog).getByRole('button', { name: '12,000 HP 환불 신청' }),
    )
    expect(
      await within(dialog).findByText(/응답을 받지 못했어요/),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('환불 금액 (HP)')).toBeDisabled()
    await waitFor(() =>
      expect(
        within(ownCard()).getByText('충전 HP').closest('div'),
      ).toHaveTextContent(/^충전 HP0$/),
    )
    expect(within(dialog).queryByRole('alert')).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    await user.click(
      await within(dialog).findByRole('button', { name: '다시 시도' }),
    )

    expect(await within(dialog).findByText('환불 완료')).toBeInTheDocument()
    expect(calls).toHaveLength(3)
    expect(new Set(calls.map((c) => c.key)).size).toBe(1)
    expect(calls.every((c) => c.amount === 12000)).toBe(true)
  })

  it('모달을 닫고 다시 신청하면 새 멱등키를 쓴다', async () => {
    const calls = mockRequestRefund((amount) =>
      rs(refund({ requestedAmount: amount, completedAmount: amount })),
    )
    renderApp('/wallet', 'USER', { chargeBalanceHp: 120000 })
    for (let i = 0; i < 2; i++) {
      const { user, dialog } = await openRefundModal()
      await user.click(
        within(dialog).getByRole('button', { name: /HP 환불 신청$/ }),
      )
      await within(dialog).findByText('환불 완료')
      await user.keyboard('{Escape}')
    }

    expect(calls).toHaveLength(2)
    expect(calls[0].key).not.toBe(calls[1].key)
  })
})

describe('처리 중', () => {
  async function submitProcessing(
    wallet: Partial<Wallet> | (() => Response) = { chargeBalanceHp: 12000 },
  ) {
    mockRequestRefund((amount) =>
      rs(
        refund({
          requestedAmount: amount,
          pendingAmount: amount,
          status: 'PROCESSING',
        }),
        202,
      ),
    )
    renderApp('/wallet', 'USER', wallet)
    const { user, dialog } = await openRefundModal()
    await user.click(
      within(dialog).getByRole('button', { name: /HP 환불 신청$/ }),
    )
    return { user, dialog }
  }

  it('처리 중이면 상태를 다시 조회하고 완료되면 멈춘다', async () => {
    const wallet = walletState(12000)
    const gets = mockGetRefund((call) => {
      if (call < 3)
        return rs(refund({ pendingAmount: 12000, status: 'PROCESSING' }))
      wallet.state.chargeBalanceHp = 0
      return rs(refund({ completedAmount: 12000 }))
    })
    const { dialog } = await submitProcessing(wallet.respond)

    expect(await within(dialog).findByText('처리 중')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/창을 닫아도 환불은 취소되지 않고/),
    ).toBeInTheDocument()
    expect(await within(dialog).findByText('환불 완료')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(ownCard()).getByText('충전 HP').closest('div'),
      ).toHaveTextContent(/^충전 HP0$/),
    )
    await settle()
    expect(gets()).toBe(3)
  })

  it('확인 한도가 지나면 늦어진다고 안내하고 새로고침으로 다시 조회한다', async () => {
    const gets = mockGetRefund(() =>
      rs(refund({ pendingAmount: 12000, status: 'PROCESSING' })),
    )
    const { user, dialog } = await submitProcessing()

    expect(
      await within(dialog).findByText(/확인이 늦어지고 있어요/, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument()
    expect(gets()).toBe(24)
    await settle()
    expect(gets()).toBe(24)

    await user.click(within(dialog).getByRole('button', { name: '새로고침' }))
    await waitFor(() => expect(gets()).toBe(25))
  })
})

describe('신청 결과', () => {
  async function submitWith(result: Refund, status = 200) {
    mockRequestRefund(() => rs(result, status))
    const gets = mockGetRefund(() => rs(result))
    renderApp('/wallet', 'USER', { chargeBalanceHp: 12000 })
    const { user, dialog } = await openRefundModal()
    await user.click(
      within(dialog).getByRole('button', { name: /HP 환불 신청$/ }),
    )
    return { dialog, gets }
  }

  const amountOf = (dialog: HTMLElement, label: string) =>
    within(dialog).getByText(label).closest('div')

  it.each([
    [
      'PARTIALLY_COMPLETED',
      '일부 환불',
      { completedAmount: 5000, returnedAmount: 7000 },
      /일부 결제 건만 취소됐어요/,
    ],
    [
      'FAILED',
      '환불 실패',
      { completedAmount: 0, returnedAmount: 12000 },
      /결제 취소에 실패해 HP를 충전 HP로 돌려놨어요/,
    ],
  ] as const)(
    '%s면 환불·반환 금액을 따로 보여 준다',
    async (status, pill, amounts, guide) => {
      const { dialog } = await submitWith(refund({ status, ...amounts }))

      expect(await within(dialog).findByText(pill)).toBeInTheDocument()
      expect(amountOf(dialog, '요청 금액')).toHaveTextContent('12,000 HP')
      expect(amountOf(dialog, '충전 HP로 돌려준 금액')).toHaveTextContent(
        `${amounts.returnedAmount.toLocaleString()} HP`,
      )
      if (amounts.completedAmount > 0)
        expect(amountOf(dialog, '환불한 금액')).toHaveTextContent('5,000 HP')
      else expect(within(dialog).queryByText('환불한 금액')).toBeNull()
      expect(within(dialog).getByText(guide)).toBeInTheDocument()
      expect(within(dialog).queryByText(/복원/)).toBeNull()
    },
  )

  it('운영자 확인이면 보류 금액과 고객센터 문의를 보여 주고 다시 조회하지 않는다', async () => {
    const { dialog, gets } = await submitWith(
      refund({
        status: 'MANUAL_REVIEW_REQUIRED',
        completedAmount: 4000,
        pendingAmount: 8000,
      }),
      202,
    )

    expect(
      await within(dialog).findByText('운영자 확인 중'),
    ).toBeInTheDocument()
    expect(amountOf(dialog, '보류 중인 금액')).toHaveTextContent('8,000 HP')
    expect(
      within(dialog).getByRole('link', { name: '고객센터 문의' }),
    ).toHaveAttribute('href', '/support')
    await settle()
    expect(gets()).toBe(0)
  })
})

describe('환불 요청 취소', () => {
  /** 접수(REQUESTED)로 끝난 신청. 지갑은 신청하면 보류로 줄어든다. */
  async function submitRequested(wallet = walletState(12000)) {
    mockRequestRefund((amount) => {
      wallet.state.chargeBalanceHp -= amount
      return rs(
        refund({
          requestedAmount: amount,
          pendingAmount: amount,
          status: 'REQUESTED',
        }),
        202,
      )
    })
    renderApp('/wallet', 'USER', wallet.respond)
    const { user, dialog } = await openRefundModal()
    await user.click(
      within(dialog).getByRole('button', { name: /HP 환불 신청$/ }),
    )
    expect(await within(dialog).findByText('접수됨')).toBeInTheDocument()
    return { user, dialog }
  }

  function mockCancel(respond: () => Response) {
    let calls = 0
    server.use(
      http.post(`*/api/v1/wallets/refunds/${REFUND_ID}/cancel`, () => {
        calls++
        return respond()
      }),
    )
    return () => calls
  }

  it('접수 상태에서는 확인한 뒤 신청을 취소하고 반환 금액을 보여 준다', async () => {
    const wallet = walletState(12000)
    mockGetRefund(() =>
      rs(refund({ pendingAmount: 12000, status: 'REQUESTED' })),
    )
    const cancels = mockCancel(() => {
      wallet.state.chargeBalanceHp = 12000
      return rs(
        refund({
          status: 'CANCELED',
          returnedAmount: 12000,
          canceledAt: '2026-10-16T01:01:00Z',
        }),
      )
    })
    const { user, dialog } = await submitRequested(wallet)
    await waitFor(() =>
      expect(
        within(ownCard()).getByText('충전 HP').closest('div'),
      ).toHaveTextContent(/^충전 HP0$/),
    )

    await user.click(
      within(dialog).getByRole('button', { name: '환불 요청 취소' }),
    )
    expect(within(dialog).getByText(/신청을 취소할까요/)).toBeInTheDocument()
    expect(cancels()).toBe(0)
    await user.click(within(dialog).getByRole('button', { name: '아니요' }))
    expect(within(dialog).queryByText(/신청을 취소할까요/)).toBeNull()

    await user.click(
      within(dialog).getByRole('button', { name: '환불 요청 취소' }),
    )
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    // 확인 버튼 이름도 '신청 취소'라서 결과 금액 행으로 취소 응답을 기다린다.
    const returned = await within(dialog).findByText('충전 HP로 돌려준 금액')
    expect(returned.closest('div')).toHaveTextContent('12,000 HP')
    expect(within(dialog).getByText('신청 취소')).toHaveClass('pill')
    expect(cancels()).toBe(1)
    await waitFor(() =>
      expect(
        within(ownCard()).getByText('충전 HP').closest('div'),
      ).toHaveTextContent(/^충전 HP12,000$/),
    )
  })

  it('취소 뒤 늦게 도착한 조회 응답이 결과를 덮어쓰지 않는다', async () => {
    // 취소를 보낼 때 이미 나가 있던 상태 조회가 취소 응답보다 늦게 온다.
    let release!: () => void
    const late = new Promise<void>((resolve) => (release = resolve))
    const gets = mockGetRefund(() =>
      late.then(() =>
        rs(refund({ pendingAmount: 12000, status: 'REQUESTED' })),
      ),
    )
    mockCancel(() => rs(refund({ status: 'CANCELED', returnedAmount: 12000 })))
    const { user, dialog } = await submitRequested()
    await waitFor(() => expect(gets()).toBe(1))

    await user.click(
      within(dialog).getByRole('button', { name: '환불 요청 취소' }),
    )
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))
    await within(dialog).findByText('충전 HP로 돌려준 금액')
    release()
    await settle()

    expect(within(dialog).queryByText('접수됨')).toBeNull()
    expect(within(dialog).getByText('신청 취소')).toHaveClass('pill')
  })

  it('이미 결제 취소를 시작했으면 최신 상태를 다시 조회한다', async () => {
    let started = false
    mockGetRefund(() =>
      rs(
        refund({
          pendingAmount: 12000,
          status: started ? 'PROCESSING' : 'REQUESTED',
        }),
      ),
    )
    mockCancel(() => {
      started = true
      return problem(409, 'REFUND_NOT_CANCELABLE')
    })
    const { user, dialog } = await submitRequested()

    await user.click(
      within(dialog).getByRole('button', { name: '환불 요청 취소' }),
    )
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    expect(await within(dialog).findByText('처리 중')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '환불 요청 취소' }),
    ).toBeNull()
    expect(
      await within(dialog).findByText(
        /이미 결제 취소를 시작해 신청을 취소할 수 없어요/,
      ),
    ).toBeInTheDocument()
  })
})

describe('오류', () => {
  it.each([
    [
      400,
      'REFUND_AMOUNT_INVALID',
      '환불 금액은 1,000 HP 이상, 1,000 HP 단위로 입력해 주세요.',
    ],
    [
      409,
      'INSUFFICIENT_BALANCE',
      '환불할 수 있는 충전 HP가 부족해요. 잔액을 다시 불러왔어요.',
    ],
    [
      503,
      'REFUND_UNAVAILABLE',
      '지금은 환불할 수 없어요. 잠시 후 다시 시도해 주세요.',
    ],
    [
      409,
      'IDEMPOTENCY_KEY_CONFLICT',
      '같은 신청이 다른 금액으로 접수됐어요. 창을 닫고 다시 신청해 주세요.',
    ],
    [400, 'SOMETHING_ELSE', 'SOMETHING_ELSE 상세'],
  ])(
    '%s %s를 안내하고 다시 신청하면 새 멱등키를 쓴다',
    async (status, code, message) => {
      const calls = mockRequestRefund(() => problem(status, code))
      renderApp('/wallet', 'USER', { chargeBalanceHp: 12000 })
      const { user, dialog } = await openRefundModal()
      const submit = () =>
        user.click(
          within(dialog).getByRole('button', { name: '12,000 HP 환불 신청' }),
        )

      await submit()
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        message,
      )
      expect(within(dialog).getByLabelText('환불 금액 (HP)')).toBeEnabled()

      await submit()
      await waitFor(() => expect(calls).toHaveLength(2))
      expect(calls[0].key).not.toBe(calls[1].key)
    },
  )

  it('충전 HP가 부족하면 지갑을 다시 불러와 새 잔액으로 검사한다', async () => {
    const wallet = walletState(12000)
    mockRequestRefund(() => {
      wallet.state.chargeBalanceHp = 5000
      return problem(409, 'INSUFFICIENT_BALANCE')
    })
    renderApp('/wallet', 'USER', wallet.respond)
    const { user, dialog } = await openRefundModal()

    await user.click(
      within(dialog).getByRole('button', { name: '12,000 HP 환불 신청' }),
    )

    expect(
      await within(dialog).findByText('충전 HP(5,000)까지만 환불할 수 있어요.'),
    ).toBeInTheDocument()
  })

  it('조회한 환불 요청이 없으면 안내하고 조회를 멈춘다', async () => {
    mockRequestRefund(() =>
      rs(refund({ pendingAmount: 12000, status: 'PROCESSING' }), 202),
    )
    const gets = mockGetRefund(() => problem(404, 'REFUND_NOT_FOUND'))
    renderApp('/wallet', 'USER', { chargeBalanceHp: 12000 })
    const { user, dialog } = await openRefundModal()

    await user.click(
      within(dialog).getByRole('button', { name: /HP 환불 신청$/ }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '환불 요청을 찾을 수 없어요. 지갑 잔액을 확인하고 고객센터로 문의해 주세요.',
    )
    await settle()
    expect(gets()).toBe(1)
  })

  it('신청 응답 전에 모달을 닫아도 지갑을 다시 불러온다', async () => {
    const wallet = walletState(12000)
    let respond!: () => void
    mockRequestRefund(
      (amount) =>
        new Promise<Response>((resolve) => {
          respond = () => {
            wallet.state.chargeBalanceHp = 0
            resolve(
              rs(refund({ requestedAmount: amount, completedAmount: amount })),
            )
          }
        }),
    )
    renderApp('/wallet', 'USER', wallet.respond)
    const { user, dialog } = await openRefundModal()

    await user.click(
      within(dialog).getByRole('button', { name: '12,000 HP 환불 신청' }),
    )
    await waitFor(() => expect(respond).toBeDefined())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    respond()

    await waitFor(() =>
      expect(
        within(ownCard()).getByText('충전 HP').closest('div'),
      ).toHaveTextContent(/^충전 HP0$/),
    )
  })
})
