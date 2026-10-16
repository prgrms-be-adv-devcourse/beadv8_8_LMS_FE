import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Wallet } from '@/entities/wallet/types'
import {
  exchange,
  mockCancelExchange,
  mockExchanges,
  mockRequestExchange,
  problem,
} from '@/test/exchanges'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const ownCard = () => screen.findByRole('region', { name: '보유 HP' })

/** 유저에게는 BE가 403을 준다. 부른 횟수를 센다. */
function forbidExchanges() {
  let calls = 0
  server.use(
    http.all('*/api/v1/settlements/*', () => {
      calls++
      return HttpResponse.json(null, { status: 403 })
    }),
  )
  return () => calls
}

/** 지갑 응답. 수익 HP를 바꾸면 다음 조회부터 바뀐 값을 준다(지갑을 다시 불러왔는지 확인용). */
function walletState(revenueBalanceHp: number) {
  const state = { revenueBalanceHp, calls: 0 }
  const respond = () => {
    state.calls++
    const wallet: Wallet = {
      walletId: 1,
      chargeBalanceHp: 0,
      revenueBalanceHp: state.revenueBalanceHp,
      heldChargeHp: 0,
      heldRevenueHp: 0,
      availableTotalHp: state.revenueBalanceHp,
      heldTotalHp: 0,
    }
    return rs(wallet)
  }
  return { state, respond }
}

/** 신청 화면을 열고 계좌를 채운다. */
async function openForm(
  revenueBalanceHp: number | (() => Response | Promise<Response>) = 43000,
) {
  const router = renderApp(
    '/wallet/exchange',
    'INFLUENCER',
    typeof revenueBalanceHp === 'number'
      ? { revenueBalanceHp }
      : revenueBalanceHp,
  )
  const user = userEvent.setup()
  const amount = await screen.findByLabelText('환전할 HP')
  return { router, user, amount }
}

async function fillAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('은행 코드'), '004')
  await user.type(screen.getByLabelText('계좌번호'), '1234-5678-9012')
  await user.type(screen.getByLabelText('예금주'), '  홍길동 ')
}

const submitButton = () => screen.getByRole('button', { name: '환전 신청' })

/** 응답을 직접 풀어 주는 지연 응답 */
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=t'
})

afterEach(() => {
  queryClient.clear()
})

describe('환전 진입점', () => {
  it('인플루언서는 지갑에서 환전 신청 버튼을 보고 누르면 신청 화면으로 간다', async () => {
    mockExchanges()
    const router = renderApp('/wallet', 'INFLUENCER', {
      revenueBalanceHp: 43000,
    })
    const user = userEvent.setup()

    await user.click(
      within(await ownCard()).getByRole('button', { name: '환전 신청' }),
    )

    expect(router.state.location.pathname).toBe('/wallet/exchange')
    expect(
      await screen.findByRole('heading', { name: '환전 신청' }),
    ).toBeInTheDocument()
  })

  it('수익 HP가 1,000 HP 미만이면 환전 신청 버튼을 끈다', async () => {
    mockExchanges()
    renderApp('/wallet', 'VERIFIED_INFLUENCER', { revenueBalanceHp: 999 })
    expect(
      within(await ownCard()).getByRole('button', { name: '환전 신청' }),
    ).toBeDisabled()
  })

  it('유저는 환전 신청 버튼과 환전 내역을 보지 않고 환전 API를 부르지 않는다', async () => {
    const calls = forbidExchanges()
    renderApp('/wallet', 'USER', { revenueBalanceHp: 0 })
    const card = await ownCard()
    expect(
      within(card).getByRole('button', { name: '환불' }),
    ).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: '환전 신청' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '환전 내역' })).toBeNull()
    expect(calls()).toBe(0)
  })

  it('유저가 신청 화면 주소로 들어오면 첫 화면으로 보낸다', async () => {
    const calls = forbidExchanges()
    const router = renderApp('/wallet/exchange', 'USER')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(calls()).toBe(0)
  })

  it('인플루언서 지갑에는 환전 내역이 있다', async () => {
    mockExchanges([exchange()])
    renderApp('/wallet', 'INFLUENCER')
    expect(
      await screen.findByRole('heading', { name: '환전 내역' }),
    ).toBeInTheDocument()
  })
})

describe('환전 신청 화면', () => {
  it('수수료 10%와 예상 수령액을 미리 보여 주고, 잘못된 입력은 제출을 막는다', async () => {
    const { user, amount } = await openForm(43500)

    expect(amount).toHaveValue('43000')
    await user.clear(amount)
    await user.type(amount, '10000')
    expect(
      screen.getByText('플랫폼 수수료 10% (원 미만 버림)').closest('div'),
    ).toHaveTextContent('−1,000')
    expect(screen.getByText('예상 수령액').closest('div')).toHaveTextContent(
      '9,000원',
    )
    // 계좌를 넣기 전에는 신청할 수 없다.
    expect(submitButton()).toBeDisabled()

    await fillAccount(user)
    expect(screen.getByLabelText('계좌번호')).toHaveValue('123456789012')
    expect(submitButton()).toBeEnabled()

    await user.clear(amount)
    await user.type(amount, '1500')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1,000 HP 단위로 입력해 주세요.',
    )
    expect(submitButton()).toBeDisabled()

    await user.clear(amount)
    await user.type(amount, '44000')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '환전할 수 있는 수익 HP(43,500)를 넘었어요.',
    )

    await user.clear(amount)
    await user.type(amount, '1000')
    await user.clear(screen.getByLabelText('은행 코드'))
    await user.type(screen.getByLabelText('은행 코드'), '04')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '은행 코드는 숫자 3자리로 입력해 주세요.',
    )
    expect(submitButton()).toBeDisabled()
  })

  it('수익 HP가 1,000 HP 미만이면 직접 들어와도 신청할 수 없다고 안내한다', async () => {
    await openForm(999)
    expect(
      screen.getByText(/환전할 수 있는 수익 HP가 없어요/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('환전할 HP')).toBeDisabled()
    expect(submitButton()).toBeDisabled()
  })
})

describe('환전 신청', () => {
  it('신청하면 서버가 확정한 금액과 마스킹 계좌를 결과로 보여 주고 지갑을 다시 불러온다', async () => {
    const wallet = walletState(43000)
    mockExchanges()
    const calls = mockRequestExchange((body) => {
      wallet.state.revenueBalanceHp -= body.amount
      return rs(
        exchange({
          exchangeId: 31,
          requestedAmount: body.amount,
          feeAmount: 4300,
          expectedPayoutAmount: 38700,
          settlementRoundDate: '2026-11-10',
          account: {
            bankCode: '004',
            accountNumberMasked: '********9012',
            accountHolderName: '홍길동',
            verificationStatus: 'PENDING',
          },
        }),
        201,
      )
    })
    const { user, router } = await openForm(wallet.respond)
    await fillAccount(user)
    const before = wallet.state.calls

    await user.click(submitButton())

    const result = await screen.findByRole('region', {
      name: '환전 신청 결과',
    })
    expect(within(result).getByText('승인 대기')).toBeInTheDocument()
    expect(
      within(result).getByText('플랫폼 수수료').closest('div'),
    ).toHaveTextContent('−4,300')
    expect(
      within(result).getByText('예상 수령액').closest('div'),
    ).toHaveTextContent('38,700원')
    expect(within(result).getByText('11/10(화) 예정')).toBeInTheDocument()
    expect(within(result).getByText('004 ********9012')).toBeInTheDocument()
    expect(calls).toEqual([
      {
        key: expect.stringMatching(/^[\w-]{1,64}$/),
        body: {
          amount: 43000,
          bankCode: '004',
          accountNumber: '123456789012',
          accountHolderName: '홍길동',
        },
      },
    ])
    await waitFor(() => expect(wallet.state.calls).toBeGreaterThan(before))

    await user.click(within(result).getByRole('link', { name: '지갑으로' }))
    expect(router.state.location.pathname).toBe('/wallet')
    expect(
      await within(await ownCard()).findByText('0', {
        selector: '.c-earn',
      }),
    ).toBeInTheDocument()
  })

  it('제출 중에 다시 눌러도 한 번만 보낸다', async () => {
    const pending = deferred()
    const calls = mockRequestExchange(() => pending.promise)
    const { user } = await openForm()
    await fillAccount(user)

    await user.dblClick(submitButton())
    await user.click(submitButton())
    expect(submitButton()).toBeDisabled()
    pending.resolve(rs(exchange(), 201))

    expect(
      await screen.findByRole('region', { name: '환전 신청 결과' }),
    ).toBeInTheDocument()
    expect(calls).toHaveLength(1)
  })

  it('응답을 받지 못하면 입력을 잠그고 같은 멱등키로 다시 시도한다', async () => {
    const calls = mockRequestExchange((_, call) => {
      if (call === 1) return HttpResponse.error()
      if (call === 2) return problem(500, 'INTERNAL_ERROR')
      return rs(exchange(), 201)
    })
    const { user } = await openForm()
    await fillAccount(user)

    await user.click(submitButton())
    expect(await screen.findByText(/응답을 받지 못했어요/)).toBeInTheDocument()
    expect(screen.getByLabelText('환전할 HP')).toBeDisabled()
    expect(screen.getByLabelText('계좌번호')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(
      await screen.findByRole('region', { name: '환전 신청 결과' }),
    ).toBeInTheDocument()
    expect(calls).toHaveLength(3)
    expect(new Set(calls.map((c) => c.key)).size).toBe(1)
    expect(new Set(calls.map((c) => JSON.stringify(c.body))).size).toBe(1)
  })

  it('지갑을 다시 불러온 뒤에 결과를 보여 줘서, 새로 신청하면 줄어든 수익 HP로 처음 금액을 정한다', async () => {
    const wallet = walletState(43000)
    // 신청 뒤 지갑 재조회 응답을 붙잡아 둔다.
    const refetch = deferred()
    let submitted = false
    mockRequestExchange((body) => {
      wallet.state.revenueBalanceHp -= body.amount
      submitted = true
      return rs(exchange({ requestedAmount: body.amount }), 201)
    })
    const { user } = await openForm(() =>
      submitted ? refetch.promise.then(wallet.respond) : wallet.respond(),
    )
    await user.clear(screen.getByLabelText('환전할 HP'))
    await user.type(screen.getByLabelText('환전할 HP'), '40000')
    await fillAccount(user)
    await user.click(submitButton())

    await waitFor(() => expect(submitted).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('region', { name: '환전 신청 결과' })).toBeNull()

    // 붙잡아 둔 재조회를 풀면 그때의 지갑 값을 준다(넘기는 응답은 쓰지 않는다).
    refetch.resolve(new Response())
    await user.click(await screen.findByRole('button', { name: '새로 신청' }))

    expect(screen.getByLabelText('환전할 HP')).toHaveValue('3000')
    expect(screen.getByText(/환전 가능 3,000 HP/)).toBeInTheDocument()
  })

  it('새로 신청하면 입력을 비우고 새 멱등키를 쓴다', async () => {
    const calls = mockRequestExchange(() => rs(exchange(), 201))
    const { user } = await openForm()
    await fillAccount(user)
    await user.click(submitButton())

    await user.click(await screen.findByRole('button', { name: '새로 신청' }))
    expect(screen.getByLabelText('계좌번호')).toHaveValue('')
    await fillAccount(user)
    await user.click(submitButton())
    await screen.findByRole('region', { name: '환전 신청 결과' })

    expect(calls).toHaveLength(2)
    expect(calls[0].key).not.toBe(calls[1].key)
  })

  it('BE가 거절하면 다음 제출은 새 멱등키를 쓴다', async () => {
    const calls = mockRequestExchange((_, call) =>
      call === 1 ? problem(409, 'INSUFFICIENT_BALANCE') : rs(exchange(), 201),
    )
    const { user } = await openForm()
    await fillAccount(user)

    await user.click(submitButton())
    await screen.findByText(/수익 HP가 부족해요/)
    await user.click(submitButton())
    await screen.findByRole('region', { name: '환전 신청 결과' })

    expect(calls).toHaveLength(2)
    expect(calls[0].key).not.toBe(calls[1].key)
  })

  it.each([
    [
      400,
      'EXCHANGE_AMOUNT_INVALID',
      '환전 금액은 1,000 HP 이상, 1,000 HP 단위로 입력해 주세요.',
    ],
    [
      409,
      'INSUFFICIENT_BALANCE',
      '환전할 수 있는 수익 HP가 부족해요. 잔액을 다시 불러왔어요.',
    ],
    [
      409,
      'IDEMPOTENCY_KEY_CONFLICT',
      '같은 신청이 다른 내용으로 접수됐어요. 새로 신청해 주세요.',
    ],
    [
      503,
      'EXCHANGE_UNAVAILABLE',
      '지금은 환전을 신청할 수 없어요. 잠시 후 다시 시도해 주세요.',
    ],
    [400, 'INVALID_REQUEST', 'INVALID_REQUEST 상세'],
  ])('%s %s 오류를 안내한다', async (status, code, message) => {
    mockRequestExchange(() => problem(status, code))
    const { user } = await openForm()
    await fillAccount(user)

    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    // 확정된 거절이라 입력을 고쳐 다시 신청할 수 있다.
    expect(screen.getByLabelText('환전할 HP')).toBeEnabled()
  })
})

describe('환전 내역', () => {
  it('최신순 내역을 상태·잠정 정산 예정일과 함께 보여 주고 페이지를 넘긴다', async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      exchange({
        exchangeId: 100 - i,
        requestedAmount: (i + 1) * 1000,
        feeAmount: (i + 1) * 100,
        expectedPayoutAmount: (i + 1) * 900,
        status: i === 0 ? 'CANCELED' : 'REQUESTED',
      }),
    )
    const { listCalls } = mockExchanges(items)
    const router = renderApp('/wallet', 'INFLUENCER')
    const user = userEvent.setup()

    const history = await screen.findByRole('region', { name: '환전 내역' })
    const rows = await within(history).findAllByRole('row')
    // 머리글 + 10행
    expect(rows).toHaveLength(11)
    expect(rows[1]).toHaveTextContent('1,000')
    expect(rows[1]).toHaveTextContent('900')
    expect(rows[1]).toHaveTextContent('11/10(화) 예정')
    expect(within(rows[1]).getByText('신청 취소')).toBeInTheDocument()
    expect(within(rows[2]).getByText('승인 대기')).toBeInTheDocument()
    expect(within(history).getByText(/잠정 날짜예요/)).toBeInTheDocument()
    expect(listCalls[0]).toEqual({ page: '0', size: '10' })

    await user.click(within(history).getByRole('button', { name: '다음' }))

    expect(router.state.location.search).toBe('?exchangePage=2')
    await waitFor(() =>
      expect(within(history).getAllByRole('row')).toHaveLength(3),
    )
    expect(listCalls.at(-1)).toEqual({ page: '1', size: '10' })
  })

  it('내역이 없으면 빈 상태를 보여 준다', async () => {
    mockExchanges([])
    renderApp('/wallet', 'INFLUENCER')
    expect(
      await screen.findByText('아직 환전 신청 내역이 없어요'),
    ).toBeInTheDocument()
  })
})

async function openDetail(items: ReturnType<typeof exchange>[]) {
  const mocks = mockExchanges(items)
  const wallet = walletState(43000)
  renderApp('/wallet', 'INFLUENCER', wallet.respond)
  const user = userEvent.setup()
  const history = await screen.findByRole('region', { name: '환전 내역' })
  const [, row] = await within(history).findAllByRole('row')
  await user.click(within(row).getByRole('button', { name: '상세' }))
  const dialog = screen.getByRole('dialog', { name: '환전 신청 상세' })
  return { user, dialog, history, wallet, ...mocks }
}

describe('환전 상세·취소', () => {
  it('신청 당시 은행 코드와 마스킹 계좌를 보여 주고, 승인 대기일 때만 취소할 수 있다', async () => {
    const { dialog, detailCalls } = await openDetail([
      exchange({ exchangeId: 7 }),
    ])
    expect(
      await within(dialog).findByText('004 **********1234'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/홍길동/)).toBeInTheDocument()
    expect(within(dialog).getByText('11/10(화) 예정')).toBeInTheDocument()
    expect(detailCalls).toEqual([7])
    expect(
      within(dialog).getByRole('button', { name: '환전 신청 취소' }),
    ).toBeInTheDocument()
  })

  it.each(['CANCELED', 'PROCESSING', 'COMPLETED'] as const)(
    '%s 상태에는 취소 버튼이 없다',
    async (status) => {
      const { dialog } = await openDetail([exchange({ status })])
      await within(dialog).findByText('004 **********1234')
      expect(
        within(dialog).queryByRole('button', { name: '환전 신청 취소' }),
      ).toBeNull()
    },
  )

  it('신청을 취소하면 확인을 거쳐 보류 HP를 돌려받고 지갑과 내역을 다시 불러온다', async () => {
    const { user, dialog, history, state, wallet } = await openDetail([
      exchange({ exchangeId: 7, requestedAmount: 5000 }),
    ])
    const calls = mockCancelExchange((id) => {
      const canceled = exchange({
        exchangeId: id,
        requestedAmount: 5000,
        status: 'CANCELED',
        canceledAt: '2026-10-16T03:00:00Z',
      })
      state.items = [canceled]
      wallet.state.revenueBalanceHp += 5000
      return rs(canceled)
    })
    await within(dialog).findByText('004 **********1234')

    await user.click(
      within(dialog).getByRole('button', { name: '환전 신청 취소' }),
    )
    expect(within(dialog).getByText(/신청을 취소할까요/)).toBeInTheDocument()
    expect(calls).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    expect(await within(dialog).findByText('취소 일시')).toBeInTheDocument()
    expect(
      within(dialog).getByText('신청 취소', { selector: '.pill' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '환전 신청 취소' }),
    ).toBeNull()
    expect(calls).toEqual([7])
    await waitFor(() =>
      expect(
        within(within(history).getByRole('table')).getByText('신청 취소', {
          selector: '.pill',
        }),
      ).toBeInTheDocument(),
    )
    await waitFor(async () =>
      expect(
        within(await ownCard()).getByText('48,000', { selector: '.c-earn' }),
      ).toBeInTheDocument(),
    )
  })

  it('이미 승인 단계면 취소할 수 없다고 안내하고 최신 상태를 다시 불러온다', async () => {
    const { user, dialog, state } = await openDetail([
      exchange({ exchangeId: 7 }),
    ])
    mockCancelExchange((id) => {
      state.items = [exchange({ exchangeId: id, status: 'PROCESSING' })]
      return problem(409, 'EXCHANGE_NOT_CANCELABLE')
    })
    await within(dialog).findByText('004 **********1234')

    await user.click(
      within(dialog).getByRole('button', { name: '환전 신청 취소' }),
    )
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '이미 승인 단계로 넘어가 신청을 취소할 수 없어요. 최신 상태를 다시 불러왔어요.',
    )
    expect(await within(dialog).findByText('송금 중')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '신청 취소' }),
    ).toBeNull()
  })
})
