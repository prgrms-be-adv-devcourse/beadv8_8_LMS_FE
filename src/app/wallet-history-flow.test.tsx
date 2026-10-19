import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { walletKeys } from '@/entities/wallet/api'
import {
  exchange,
  mockCancelExchange,
  mockExchanges,
  problem,
} from '@/test/exchanges'
import { renderApp, rs } from '@/test/renderApp'
import {
  earning,
  earningSummary,
  mockEarnings,
  mockTransactions,
  transaction,
} from '@/test/walletHistory'

const ledger = () => screen.findByRole('region', { name: '거래 원장' })
const earnings = () => screen.findByRole('region', { name: '지급 예정 수익' })

/** 표의 본문 행 */
async function rowsOf(region: HTMLElement) {
  const table = await within(region).findByRole('table')
  return within(table).getAllByRole('row').slice(1)
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=t'
})

afterEach(() => {
  queryClient.setQueryDefaults(walletKeys.earnings(), {})
  queryClient.clear()
})

describe('거래 원장', () => {
  it('유저는 지갑에서 거래 원장을 보고 지급 예정 수익은 보지 않는다', async () => {
    mockTransactions([transaction()])
    const { listCalls, summaryCalls } = mockEarnings()
    renderApp('/wallet', 'USER')

    expect(await rowsOf(await ledger())).toHaveLength(1)
    expect(screen.queryByRole('region', { name: '지급 예정 수익' })).toBeNull()
    expect(listCalls).toHaveLength(0)
    expect(summaryCalls()).toBe(0)
  })

  it('거래를 최신순으로 일시·내용·HP 종류·증감과 함께 보여 준다', async () => {
    const earned = {
      availableChangeHp: 45000,
      heldChangeHp: 0,
      totalChangeHp: 45000,
    }
    mockTransactions([
      transaction({
        transactionId: 2,
        type: 'EARNING_RECEIVED',
        displayName: '수익 HP 지급',
        referenceType: 'SETTLEMENT',
        occurredAt: '2026-10-17T00:10:00Z',
        ...earned,
        revenue: earned,
      }),
      transaction({ transactionId: 1, occurredAt: '2026-10-16T11:00:00Z' }),
    ])
    renderApp('/wallet', 'INFLUENCER')

    const [first, second] = await rowsOf(await ledger())
    expect(first).toHaveTextContent('10/17(토) 09:10')
    expect(within(first).getByText('수익 HP 지급')).toBeInTheDocument()
    expect(within(first).getByText('수익')).toBeInTheDocument()
    expect(within(first).getByText('+45,000')).toHaveClass('amt-p')
    expect(second).toHaveTextContent('10/16(금) 20:00')
    expect(within(second).getByText('HP 충전')).toBeInTheDocument()
    expect(within(second).getByText('충전')).toBeInTheDocument()
    expect(within(second).getByText('+100,000')).toBeInTheDocument()
  })

  it('결제 보류는 가용 감소와 보류 증가를 함께 보여 주고, 지급 확정은 보류 감소만 보여 준다', async () => {
    mockTransactions([
      transaction({
        transactionId: 2,
        type: 'PAYMENT_SETTLED',
        displayName: '결제 지급 확정',
        referenceType: 'LECTURE_ORDER_ITEM',
        availableChangeHp: 0,
        heldChangeHp: -30000,
      }),
      transaction({
        transactionId: 1,
        type: 'PAYMENT_HOLD',
        displayName: '결제 보류',
        referenceType: 'LECTURE_ORDER_ITEM',
        availableChangeHp: -30000,
        heldChangeHp: 30000,
      }),
    ])
    renderApp('/wallet', 'USER')

    const [settled, held] = await rowsOf(await ledger())
    expect(within(settled).getByText('보류 −30,000')).toBeInTheDocument()
    expect(within(settled).queryByText('0')).toBeNull()
    expect(within(held).getByText('−30,000')).toHaveClass('amt-m')
    expect(within(held).getByText('보류 +30,000')).toBeInTheDocument()
  })

  it('출연 요청서·모집글 거래에는 그 화면으로 가는 링크가 있다', async () => {
    const hold = { availableChangeHp: -50000, heldChangeHp: 50000 }
    mockTransactions([
      transaction({
        transactionId: 3,
        displayName: '결제 보류',
        referenceType: 'APPEARANCE_REQUEST',
        referenceId: 11,
        ...hold,
      }),
      transaction({
        transactionId: 2,
        displayName: '결제 보류',
        referenceType: 'APPEARANCE_RECRUIT',
        referenceId: 12,
        ...hold,
      }),
      transaction({
        transactionId: 1,
        displayName: '결제 보류',
        referenceType: 'LECTURE_ORDER_ITEM',
        referenceId: 13,
        ...hold,
      }),
    ])
    renderApp('/wallet', 'INFLUENCER')

    const [request, recruit, lecture] = await rowsOf(await ledger())
    expect(
      within(request).getByRole('link', { name: '출연 요청서 보기' }),
    ).toHaveAttribute('href', '/appearances/requests/11')
    expect(
      within(recruit).getByRole('link', { name: '모집글 보기' }),
    ).toHaveAttribute('href', '/recruits/12')
    expect(within(lecture).queryByRole('link')).toBeNull()
  })

  it('거래가 없으면 빈 상태를 보여 준다', async () => {
    mockTransactions([])
    renderApp('/wallet', 'USER')

    expect(
      await within(await ledger()).findByText('아직 HP 거래가 없어요'),
    ).toBeInTheDocument()
  })

  it('원장을 불러오지 못하면 다시 시도할 수 있다', async () => {
    let fail = true
    mockTransactions([transaction()], () =>
      fail ? problem(400, 'INVALID_REQUEST') : undefined,
    )
    renderApp('/wallet', 'USER')

    const region = await ledger()
    const retry = await within(region).findByRole('button', {
      name: '다시 시도',
    })
    fail = false
    await userEvent.setup().click(retry)
    expect(await rowsOf(region)).toHaveLength(1)
  })

  it('다음 페이지를 누르면 ?txPage=2가 되고 page=1·size=20으로 부른다', async () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      transaction({ transactionId: 25 - i, displayName: `거래 ${25 - i}` }),
    )
    const { calls } = mockTransactions(items)
    const router = renderApp('/wallet', 'USER')
    const region = await ledger()
    expect(await rowsOf(region)).toHaveLength(20)

    await userEvent
      .setup()
      .click(within(region).getByRole('button', { name: '다음' }))

    expect(await within(region).findByText('거래 5')).toBeInTheDocument()
    expect(await rowsOf(region)).toHaveLength(5)
    expect(router.state.location.search).toBe('?txPage=2')
    expect(calls.at(-1)).toMatchObject({ page: '1', size: '20' })
  })

  it('마지막 페이지를 넘는 txPage는 마지막 페이지로 옮긴다', async () => {
    mockTransactions([transaction()])
    const router = renderApp('/wallet?txPage=4', 'USER')

    expect(await rowsOf(await ledger())).toHaveLength(1)
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('환전 신청을 취소하면 거래 원장과 수익 요약을 다시 불러온다', async () => {
    const { state: exchanges } = mockExchanges([
      exchange({ exchangeId: 7, requestedAmount: 5000 }),
    ])
    const { calls, state } = mockTransactions([transaction()])
    const { summaryCalls } = mockEarnings()
    mockCancelExchange((id) => {
      const canceled = exchange({ exchangeId: id, status: 'CANCELED' })
      exchanges.items = [canceled]
      state.items = [
        transaction({
          transactionId: 2,
          type: 'EXCHANGE_RELEASE',
          displayName: '환전 보류 해제',
          availableChangeHp: 5000,
          heldChangeHp: -5000,
        }),
        ...state.items,
      ]
      return rs(canceled)
    })
    renderApp('/wallet', 'INFLUENCER')
    const user = userEvent.setup()
    const region = await ledger()
    expect(await rowsOf(region)).toHaveLength(1)
    const before = { tx: calls.length, summary: summaryCalls() }

    const history = await screen.findByRole('region', { name: '환전 내역' })
    await user.click(
      await within(history).findByRole('button', { name: '상세' }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(
      await within(dialog).findByRole('button', { name: '환전 신청 취소' }),
    )
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    expect(
      await within(region).findByText('환전 보류 해제'),
    ).toBeInTheDocument()
    expect(calls.length).toBeGreaterThan(before.tx)
    expect(summaryCalls()).toBeGreaterThan(before.summary)
  })
})

describe('지급 예정 수익', () => {
  it('인플루언서는 상태별 금액·건수와 합계, 기준 시각을 본다', async () => {
    mockEarnings({
      summary: earningSummary({
        confirmationPending: { amountHp: 12000, count: 1 },
        scheduled: { amountHp: 90000, count: 2 },
        failed: { amountHp: 5000, count: 1 },
        total: { amountHp: 107000, count: 4 },
        asOf: '2026-10-19T05:30:00Z',
      }),
    })
    renderApp('/wallet', 'INFLUENCER')

    const summary = await within(await earnings()).findByRole('list', {
      name: '수익 요약',
    })
    const item = (label: string) =>
      within(summary).getByText(label).closest('li')!
    expect(item('확인 대기')).toHaveTextContent('12,000 HP · 1건')
    expect(item('지급 예정')).toHaveTextContent('90,000 HP · 2건')
    expect(item('보류')).toHaveTextContent('0 HP · 0건')
    expect(item('처리 중')).toHaveTextContent('0 HP · 0건')
    expect(item('실패')).toHaveTextContent('5,000 HP · 1건')
    expect(item('합계')).toHaveTextContent('107,000 HP · 4건')
    expect(
      within(await earnings()).getByText('10/19(월) 14:30 기준'),
    ).toBeInTheDocument()
  })

  it('수익 목록에 출처·제목·금액·상태·지급 예정 시각을 보여 주고, 예정 시각이 없으면 미정이라고 쓴다', async () => {
    mockEarnings({
      items: [
        earning({ sourceId: 1 }),
        earning({
          sourceType: 'APPEARANCE',
          sourceId: 2,
          earningType: 'APPEARANCE_FEE',
          title: '주말 합방',
          amountHp: 60000,
          status: 'CONFIRMATION_PENDING',
          payoutScheduledAt: null,
        }),
      ],
    })
    renderApp('/wallet', 'INFLUENCER')

    const [lecture, appearance] = await rowsOf(await earnings())
    expect(within(lecture).getByText('강의 판매')).toBeInTheDocument()
    expect(within(lecture).getByText('방송 셋업 입문')).toBeInTheDocument()
    expect(within(lecture).getByText('45,000')).toBeInTheDocument()
    expect(within(lecture).getByText('지급 예정')).toHaveClass('pill')
    expect(lecture).toHaveTextContent('11/10(화) 09:00')
    expect(within(appearance).getByText('출연료')).toBeInTheDocument()
    expect(within(appearance).getByText('주말 합방')).toBeInTheDocument()
    expect(within(appearance).getByText('확인 대기')).toHaveClass('pill')
    expect(within(appearance).getByText('미정')).toBeInTheDocument()
  })

  it('지급 완료를 누르면 ?earning=completed가 되고 status=COMPLETED로 부르며 수익 페이지를 처음으로 돌린다', async () => {
    const unpaid = Array.from({ length: 12 }, (_, i) =>
      earning({ sourceId: i + 1, title: `미지급 ${i + 1}` }),
    )
    const { listCalls } = mockEarnings({
      items: [
        ...unpaid,
        earning({ sourceId: 99, title: '지급된 강의', status: 'COMPLETED' }),
      ],
    })
    const router = renderApp('/wallet?earningPage=2', 'INFLUENCER')
    const region = await earnings()
    expect(await within(region).findByText('미지급 11')).toBeInTheDocument()
    const filters = within(region).getByRole('group', { name: '수익 상태' })
    expect(
      within(filters).getByRole('button', { name: '미지급' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await userEvent
      .setup()
      .click(within(filters).getByRole('button', { name: '지급 완료' }))

    expect(await within(region).findByText('지급된 강의')).toBeInTheDocument()
    expect(
      within(filters).getByRole('button', { name: '지급 완료' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).toBe('?earning=completed')
    expect(listCalls.at(-1)).toMatchObject({
      page: '0',
      size: '10',
      status: ['COMPLETED'],
    })
    expect(listCalls[0].status).toEqual([])
  })

  it('수익 목록이 비면 빈 상태를 보여 준다', async () => {
    mockEarnings({ items: [] })
    renderApp('/wallet', 'INFLUENCER')

    expect(
      await within(await earnings()).findByText('지급 예정인 수익이 없어요'),
    ).toBeInTheDocument()
  })

  it('원장과 수익 목록의 페이지는 서로 따로 움직인다', async () => {
    mockTransactions(
      Array.from({ length: 25 }, (_, i) =>
        transaction({ transactionId: 25 - i, displayName: `거래 ${25 - i}` }),
      ),
    )
    mockEarnings({
      items: Array.from({ length: 12 }, (_, i) =>
        earning({ sourceId: i + 1, title: `수익 ${i + 1}` }),
      ),
    })
    const router = renderApp('/wallet', 'INFLUENCER')
    const user = userEvent.setup()
    const tx = await ledger()
    const earn = await earnings()
    await within(tx).findByText('거래 25')
    await within(earn).findByText('수익 1')

    await user.click(within(tx).getByRole('button', { name: '다음' }))
    await within(tx).findByText('거래 5')
    await user.click(within(earn).getByRole('button', { name: '다음' }))
    await within(earn).findByText('수익 11')

    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('txPage')).toBe('2')
    expect(params.get('earningPage')).toBe('2')
    expect(within(tx).getByText('거래 5')).toBeInTheDocument()
  })

  it('수익 조회가 503이어도 잔액 카드와 거래 원장은 보이고, 다시 시도하면 수익을 불러온다', async () => {
    queryClient.setQueryDefaults(walletKeys.earnings(), { retry: false })
    let down = true
    const unavailable = () =>
      down ? problem(503, 'EARNING_SOURCE_UNAVAILABLE') : undefined
    const { state } = mockEarnings({
      items: [earning()],
      respondSummary: unavailable,
      respondList: unavailable,
    })
    mockTransactions([transaction()])
    renderApp('/wallet', 'INFLUENCER')

    const region = await earnings()
    const retry = await within(region).findByRole('button', {
      name: '다시 시도',
    })
    expect(
      within(region).getAllByRole('button', { name: '다시 시도' }),
    ).toHaveLength(1)
    expect(
      await screen.findByRole('region', { name: '보유 HP' }),
    ).toBeInTheDocument()
    expect(await rowsOf(await ledger())).toHaveLength(1)

    down = false
    state.summary = earningSummary({
      scheduled: { amountHp: 45000, count: 1 },
      total: { amountHp: 45000, count: 1 },
    })
    await userEvent.setup().click(retry)

    expect(
      await within(region).findByText('방송 셋업 입문'),
    ).toBeInTheDocument()
    expect(
      within(within(region).getByRole('list', { name: '수익 요약' }))
        .getByText('합계')
        .closest('li'),
    ).toHaveTextContent('45,000 HP · 1건')
  })
})
