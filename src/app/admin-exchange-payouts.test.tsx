import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  adminExchangePayoutsQuery,
  adminExchangesQuery,
} from '@/entities/wallet/adminExchangeApi'
import { feeIncomesQuery } from '@/entities/wallet/platformWalletApi'
import type { AdminExchange } from '@/entities/wallet/types'
import {
  adminExchange,
  adminExchangeDb,
  adminExchangeHandlers,
  payoutAttempt,
  resetAdminExchangeDb,
} from '@/test/adminExchangeMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

// 관리자 환전·송금 시도 API는 테스트 전용 목(src/test/adminExchangeMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetAdminExchangeDb()
  server.use(...adminExchangeHandlers)
})

/** 처리 뒤 다시 불러오기까지 끝나야 다음 테스트로 요청이 새지 않는다 */
async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

afterEach(async () => {
  await settle()
  queryClient.clear()
})

/** 승인 뒤 송금 단계에 들어간 환전 */
const approved = (patch: Partial<AdminExchange>) =>
  adminExchange({
    approvedBy: 9,
    approvedAt: '2026-10-15T05:00:00Z',
    ...patch,
  })

/** 첫 자동 송금이 운영자 확인으로 넘어간 환전 #61 */
const manualReview = () =>
  resetAdminExchangeDb(
    [approved({ exchangeId: 61, status: 'UNKNOWN' })],
    [payoutAttempt()],
  )

/** 은행이 첫 송금의 실패를 확정한 환전 #62 */
const bankFailed = () =>
  resetAdminExchangeDb(
    [approved({ exchangeId: 62, status: 'FAILED' })],
    [
      payoutAttempt({
        exchangeId: 62,
        payoutId: 5,
        status: 'FAILED',
        failureReason: 'MOCK_TRANSFER_REJECTED',
        failedAt: '2026-11-10T01:05:00Z',
        manualReviewAt: null,
      }),
    ],
  )

const emptyPage = () => ({
  content: [],
  page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
})

const table = () => screen.findByRole('table', { name: '송금 시도 목록' })
const listRow = async (exchangeId: number, attemptNo = 1) =>
  within(await table()).findByRole('row', {
    name: `환전 #${exchangeId} 송금 시도 ${attemptNo}`,
  })
const panel = () => screen.findByRole('region', { name: '송금 시도' })
const history = async () =>
  within(await panel()).findByRole('table', { name: '송금 시도 이력' })
const attemptRow = async (attemptNo: number) =>
  within(await history()).findByRole('row', {
    name: `송금 시도 ${attemptNo}`,
  })
const statusPill = () =>
  screen.findByText(/송금|확인 중|승인/, { selector: '.ph-actions .pill' })
const button = (name: string) =>
  within(screen.getByRole('region', { name: '송금 시도' })).queryByRole(
    'button',
    { name },
  )

describe('송금 확인 목록', () => {
  it('운영 메뉴에서 들어가 운영자 확인이 필요한 송금 시도를 오래된 순으로 보고 환전 상세로 간다', async () => {
    resetAdminExchangeDb(
      [
        approved({ exchangeId: 61, status: 'UNKNOWN' }),
        approved({ exchangeId: 63, status: 'UNKNOWN' }),
      ],
      [
        payoutAttempt({
          exchangeId: 63,
          payoutId: 9,
          attemptNo: 2,
          requestedBy: 7,
          requestedAt: '2026-11-11T01:00:00Z',
          failureReason: 'AUTO_CHECK_EXPIRED',
          manualCheckedAt: '2026-11-12T02:00:00Z',
          manualCheckedBy: 7,
        }),
        payoutAttempt(),
        payoutAttempt({ exchangeId: 64, payoutId: 10, status: 'UNKNOWN' }),
      ],
    )
    const router = renderApp('/admin/exchange-payouts', 'ADMIN')

    // 메뉴 순서(환전 승인 다음)는 router.test.tsx가 본다
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '송금 확인' }),
    ).toHaveAttribute('href', '/admin/exchange-payouts')
    expect(
      await screen.findByRole('heading', { level: 1, name: '송금 확인' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: '송금 상태' })).getByRole(
        'button',
        { name: '운영자 확인' },
      ),
    ).toHaveAttribute('aria-pressed', 'true')

    const rows = within(await table()).getAllByRole('row')
    // 머리글 + 운영자 확인 2건(오래된 순)
    expect(rows).toHaveLength(3)
    const first = await listRow(61)
    expect(rows[1]).toBe(first)
    expect(first).toHaveTextContent('11/10(화) 10:00')
    expect(first).toHaveTextContent('환전 #61')
    expect(first).toHaveTextContent('시도 #1')
    expect(first).toHaveTextContent('9,000')
    expect(first).toHaveTextContent('REJECTED_409:DUPLICATE')
    expect(first).toHaveTextContent('운영자 확인으로 넘김')
    expect(within(first).getByText('운영자 확인')).toHaveClass('pill', 'bad')
    expect(within(first).getByText('확인 중')).toHaveClass('pill', 'warn')

    const retried = await listRow(63, 2)
    expect(retried).toHaveTextContent('시도 #2 · 관리자 #7 재송금')
    expect(retried).toHaveTextContent('AUTO_CHECK_EXPIRED')
    expect(retried).toHaveTextContent('관리자 재확인')

    // 계좌번호는 응답에도 화면에도 없다
    expect(screen.queryByText(/\*{4}/)).toBeNull()
    expect(screen.getByText('확인 필요 2건')).toBeInTheDocument()
    expect(adminExchangeDb.payoutListCalls[0]).toEqual({
      status: 'MANUAL_REVIEW_REQUIRED',
      page: '0',
      size: '20',
    })

    await userEvent.click(within(first).getByRole('link', { name: '상세' }))
    expect(router.state.location.pathname).toBe('/admin/exchanges/61')
    expect(
      await screen.findByRole('heading', { level: 1, name: '환전 신청 #61' }),
    ).toBeInTheDocument()
  })

  it('상태를 바꾸면 URL ?status=로 두고 그 상태의 첫 페이지를 요청한다', async () => {
    manualReview()
    adminExchangeDb.payouts.push(
      payoutAttempt({ exchangeId: 64, payoutId: 10, status: 'UNKNOWN' }),
    )
    const router = renderApp('/admin/exchange-payouts', 'ADMIN')
    const user = userEvent.setup()
    await listRow(61)
    const group = screen.getByRole('group', { name: '송금 상태' })

    await user.click(within(group).getByRole('button', { name: '결과 불명' }))

    expect(router.state.location.search).toBe('?status=UNKNOWN')
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: '결과 불명' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(within(await listRow(64)).getByText('결과 불명')).toBeInTheDocument()
    expect(adminExchangeDb.payoutListCalls).toContainEqual({
      status: 'UNKNOWN',
      page: '0',
      size: '20',
    })
    // 머리글 건수는 필터와 관계없이 운영자 확인 기준이다
    expect(screen.getByText('확인 필요 1건')).toBeInTheDocument()
  })

  it('페이지는 URL ?page=로 두고 그 페이지를 요청한다', async () => {
    resetAdminExchangeDb(
      [],
      Array.from({ length: 25 }, (_, i) =>
        payoutAttempt({
          exchangeId: 100 + i,
          payoutId: 100 + i,
          requestedAt: `2026-10-${String(i + 1).padStart(2, '0')}T01:00:00Z`,
        }),
      ),
    )
    const router = renderApp('/admin/exchange-payouts', 'ADMIN')
    const user = userEvent.setup()
    await listRow(100)

    await user.click(screen.getByRole('button', { name: '다음' }))

    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(await listRow(120)).toBeInTheDocument()
    expect(adminExchangeDb.payoutListCalls).toContainEqual({
      status: 'MANUAL_REVIEW_REQUIRED',
      page: '1',
      size: '20',
    })
  })

  it('없으면 상태에 맞는 빈 상태를 보여 주고 송금 실패 환전으로 가는 길은 그대로 둔다', async () => {
    renderApp('/admin/exchange-payouts?status=PROCESSING', 'ADMIN')
    expect(
      await screen.findByText('결과를 기다리는 송금이 없어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('운영자 확인 대상 없음')).toBeInTheDocument()
    expect(
      within(screen.getByRole('note', { name: '판단 대기 환전' })).getByRole(
        'link',
        { name: '환전 승인의 송금 실패' },
      ),
    ).toHaveAttribute('href', '/admin/exchanges?status=FAILED')
  })

  it('운영자 확인 대상이 없어도 판단을 기다리는 송금 실패 환전 건수를 알리고 그 목록으로 간다', async () => {
    bankFailed()
    const router = renderApp('/admin/exchange-payouts', 'ADMIN')
    const user = userEvent.setup()
    expect(
      await screen.findByText('운영자 확인이 필요한 송금이 없어요'),
    ).toBeInTheDocument()
    const note = screen.getByRole('note', { name: '판단 대기 환전' })
    await waitFor(() =>
      expect(note).toHaveTextContent(
        '송금이 확정 실패해 판단을 기다리는 환전이 1건 있어요.',
      ),
    )

    await user.click(
      within(note).getByRole('link', { name: '환전 승인의 송금 실패' }),
    )

    expect(router.state.location.pathname).toBe('/admin/exchanges')
    expect(router.state.location.search).toBe('?status=FAILED')
    expect(
      await within(
        await screen.findByRole('table', { name: '환전 신청 목록' }),
      ).findByRole('row', { name: '환전 신청 #62' }),
    ).toBeInTheDocument()
  })

  it('송금 실패한 환전은 환전 목록의 송금 실패 필터로 본다', async () => {
    bankFailed()
    const router = renderApp('/admin/exchanges', 'ADMIN')
    const user = userEvent.setup()
    const group = await screen.findByRole('group', { name: '환전 상태' })

    await user.click(within(group).getByRole('button', { name: '송금 실패' }))

    expect(router.state.location.search).toBe('?status=FAILED')
    const row = await within(
      await screen.findByRole('table', { name: '환전 신청 목록' }),
    ).findByRole('row', { name: '환전 신청 #62' })
    expect(within(row).getByText('송금 실패')).toHaveClass('pill', 'bad')
    expect(adminExchangeDb.listCalls).toContainEqual({
      status: 'FAILED',
      page: '0',
      size: '20',
    })
  })

  it('관리자가 아니면 열 수 없고 송금 시도 API를 부르지 않는다', async () => {
    renderApp('/admin/exchange-payouts', 'VERIFIED_INFLUENCER')
    expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '송금 확인' })).toBeNull()
    expect(adminExchangeDb.payoutListCalls).toEqual([])
  })
})

describe('환전 상세의 송금 시도 패널', () => {
  it('승인 대기 신청에는 송금 시도 패널이 없다', async () => {
    renderApp('/admin/exchanges/11', 'ADMIN')
    expect(
      await screen.findByRole('region', { name: '처리' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '송금 시도' })).toBeNull()
  })

  it('승인했지만 아직 보내지 않았으면 시도가 없다고 안내하고 버튼이 없다', async () => {
    renderApp('/admin/exchanges/13', 'ADMIN')
    const region = await panel()
    expect(
      await within(region).findByText(/아직 송금 시도가 없어요/),
    ).toBeInTheDocument()
    expect(within(region).queryByRole('button')).toBeNull()
  })

  it('운영자 확인 시도는 이력을 보여 주고 결과 재확인만 할 수 있다', async () => {
    manualReview()
    renderApp('/admin/exchanges/61', 'ADMIN')

    const row = await attemptRow(1)
    expect(within(row).getByText('운영자 확인')).toHaveClass('pill', 'bad')
    expect(row).toHaveTextContent('#1')
    expect(row).toHaveTextContent('9,000')
    expect(row).toHaveTextContent('11/10(화) 10:00')
    expect(row).toHaveTextContent('자동 송금')
    expect(row).toHaveTextContent(
      '요청 ID 7d1c2a3e-0000-4000-8000-000000000001',
    )
    expect(row).toHaveTextContent('사유 REJECTED_409:DUPLICATE')
    expect(row).toHaveTextContent('자동 확인 0회')
    expect(button('결과 재확인')).toBeEnabled()
    expect(button('재송금')).toBeNull()
    expect(button('최종 실패 확정')).toBeNull()
  })

  it('결과 재확인이 성공을 받으면 확인 창 없이 바로 송금 완료로 바뀌고 목록·대시보드·수수료 수입을 무효화한다', async () => {
    manualReview()
    // 목록 화면·대시보드 카드와 수수료 수입 화면을 먼저 열어 둔 상태
    queryClient.setQueryData(
      adminExchangePayoutsQuery('MANUAL_REVIEW_REQUIRED', 0).queryKey,
      emptyPage(),
    )
    queryClient.setQueryData(feeIncomesQuery(0).queryKey, emptyPage())
    renderApp('/admin/exchanges/61', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)

    await user.click(button('결과 재확인')!)

    expect(
      await screen.findByText('송금이 성공했어요. 환전을 마쳤어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(adminExchangeDb.recheckCalls).toEqual([61])
    await waitFor(async () =>
      expect(await statusPill()).toHaveTextContent('송금 완료'),
    )
    const row = await attemptRow(1)
    await waitFor(() => expect(row).toHaveTextContent('송금 성공'))
    expect(row).toHaveTextContent('거래 번호 TX-1')
    expect(row).toHaveTextContent('관리자 #1 재확인')
    expect(button('결과 재확인')).toBeNull()
    for (const key of [
      adminExchangePayoutsQuery('MANUAL_REVIEW_REQUIRED', 0).queryKey,
      feeIncomesQuery(0).queryKey,
    ])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('결과 재확인이 은행 확정 실패를 받으면 재송금·최종 실패 확정으로 바뀐다', async () => {
    manualReview()
    adminExchangeDb.bank = 'FAILED'
    renderApp('/admin/exchanges/61', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)

    await user.click(button('결과 재확인')!)

    expect(
      await screen.findByText(
        '은행이 송금 실패를 확정했어요. 다시 송금하거나 최종 실패로 끝낼 수 있어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(button('재송금')).toBeEnabled())
    expect(button('최종 실패 확정')).toBeEnabled()
    expect(button('결과 재확인')).toBeNull()
    expect(await statusPill()).toHaveTextContent('송금 실패')
  })

  it('결과 재확인에서도 결과를 모르면 상태 그대로 두고 다시 확인할 수 있다', async () => {
    manualReview()
    adminExchangeDb.bank = 'UNKNOWN'
    renderApp('/admin/exchanges/61', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)

    await user.click(button('결과 재확인')!)

    expect(
      await screen.findByText(
        '아직 결과를 몰라요. 운영자 확인 상태 그대로예요.',
      ),
    ).toBeInTheDocument()
    await settle()
    expect(button('결과 재확인')).toBeEnabled()
    expect(await attemptRow(1)).toHaveTextContent('관리자 #1 재확인')
  })

  it('송금을 쓸 수 없으면(503) 안내하고 다시 확인할 수 있다', async () => {
    manualReview()
    adminExchangeDb.bank = 'UNAVAILABLE'
    renderApp('/admin/exchanges/61', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)

    await user.click(button('결과 재확인')!)

    expect(
      await screen.findByText(
        '지금은 송금을 처리할 수 없어요. 잠시 뒤 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    await settle()
    expect(button('결과 재확인')).toBeEnabled()
  })

  it('자동 확인이 먼저 결과를 확정했으면(409) 안내하고 최신 상태를 불러온다', async () => {
    manualReview()
    renderApp('/admin/exchanges/61', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)
    adminExchangeDb.payouts = adminExchangeDb.payouts.map((p) => ({
      ...p,
      status: 'COMPLETED',
      completedAt: '2026-11-16T02:00:00Z',
    }))
    adminExchangeDb.items = adminExchangeDb.items.map((x) => ({
      ...x,
      status: 'COMPLETED',
    }))

    await user.click(button('결과 재확인')!)

    expect(
      await screen.findByText(
        '결과를 다시 확인할 송금 시도가 없어요. 최신 상태를 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(button('결과 재확인')).toBeNull())
    expect(await statusPill()).toHaveTextContent('송금 완료')
  })

  it('송금 실패한 환전은 확인 창을 거쳐 재송금하고 새 시도가 이력에 더해진다', async () => {
    bankFailed()
    renderApp('/admin/exchanges/62', 'ADMIN')
    const user = userEvent.setup()
    const row = await attemptRow(1)
    expect(within(row).getByText('송금 실패')).toHaveClass('pill', 'bad')
    expect(row).toHaveTextContent('사유 MOCK_TRANSFER_REJECTED')
    expect(button('결과 재확인')).toBeNull()

    await user.click(button('재송금')!)
    const dialog = screen.getByRole('dialog', {
      name: '송금을 다시 보낼까요?',
    })
    expect(dialog).toHaveTextContent('별빛 · 회원 #21 · 인플루언서')
    expect(dialog).toHaveTextContent('9,000원')
    expect(dialog).toHaveTextContent('되돌릴 수 없어요')
    // 계좌번호는 보이지 않는다
    expect(dialog).not.toHaveTextContent('1234')
    expect(adminExchangeDb.retryCalls).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: '재송금' }))

    expect(
      await screen.findByText('다시 송금했고 성공했어요. 환전을 마쳤어요.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(adminExchangeDb.retryCalls).toEqual([62])
    const second = await attemptRow(2)
    expect(second).toHaveTextContent('관리자 #1 재송금')
    expect(second).toHaveTextContent('송금 성공')
    await waitFor(async () =>
      expect(await statusPill()).toHaveTextContent('송금 완료'),
    )
    expect(button('재송금')).toBeNull()
    expect(button('최종 실패 확정')).toBeNull()
  })

  it('재송금 확인 창을 닫으면 보내지 않는다', async () => {
    bankFailed()
    renderApp('/admin/exchanges/62', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)

    await user.click(button('재송금')!)
    await user.click(
      within(screen.getByRole('dialog'))
        .getAllByRole('button', { name: '닫기' })
        .at(-1)!,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(adminExchangeDb.retryCalls).toEqual([])
  })

  it('최종 실패 확정은 사유를 검사하고, 확정하면 처리 기록에 남고 버튼이 사라진다', async () => {
    bankFailed()
    queryClient.setQueryData(
      adminExchangesQuery('FAILED', 0).queryKey,
      emptyPage(),
    )
    renderApp('/admin/exchanges/62', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)

    await user.click(button('최종 실패 확정')!)
    const dialog = screen.getByRole('dialog', {
      name: '최종 실패로 끝낼까요?',
    })
    expect(dialog).toHaveTextContent('10,000 HP')
    expect(dialog).toHaveTextContent('0/500')
    const submit = within(dialog).getByRole('button', {
      name: '최종 실패 확정',
    })
    expect(submit).toBeDisabled()

    const input = within(dialog).getByLabelText('최종 실패 사유')
    await user.type(input, '   ')
    expect(submit).toBeDisabled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '최종 실패 사유를 입력해 주세요.',
    )
    await user.clear(input)
    await user.click(input)
    await user.paste('가'.repeat(501))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '최종 실패 사유는 500자까지 입력할 수 있어요.',
    )
    expect(submit).toBeDisabled()

    await user.clear(input)
    await user.type(input, '  계좌가 해지됐어요 ')
    expect(dialog).toHaveTextContent('9/500')
    await user.click(submit)

    expect(
      await screen.findByText(
        '최종 실패로 끝냈어요. 보류한 수익 HP는 신청자에게 돌아가요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(adminExchangeDb.finalFailureCalls).toEqual([
      { exchangeId: 62, body: { reason: '계좌가 해지됐어요' } },
    ])
    expect(await statusPill()).toHaveTextContent('송금 실패 · HP 반환')
    expect(screen.getByRole('region', { name: '처리 기록' })).toHaveTextContent(
      '최종 실패 사유계좌가 해지됐어요',
    )
    expect(button('재송금')).toBeNull()
    expect(button('최종 실패 확정')).toBeNull()
    // 환전 목록도 무효화한다
    expect(
      queryClient.getQueryState(adminExchangesQuery('FAILED', 0).queryKey)
        ?.isInvalidated,
    ).toBe(true)
  })

  it('BE가 사유 형식을 거절하면(400) 모달에 오류를 보여 준다', async () => {
    bankFailed()
    renderApp('/admin/exchanges/62', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)
    server.use(
      http.post(
        '*/api/v1/settlements/admin/exchanges/62/payouts/final-failure',
        () =>
          HttpResponse.json(
            {
              status: 400,
              code: 'EXCHANGE_FINAL_FAILURE_REASON_INVALID',
              detail: '최종 실패 사유는 앞뒤 공백을 빼고 1~500자여야 합니다.',
            },
            { status: 400 },
          ),
      ),
    )

    await user.click(button('최종 실패 확정')!)
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('최종 실패 사유'), '사유')
    await user.click(
      within(dialog).getByRole('button', { name: '최종 실패 확정' }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '최종 실패 사유는 앞뒤 공백을 빼고 1~500자여야 해요.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('그사이 상태가 바뀌어 최종 실패로 끝낼 수 없으면(409) 안내하고 모달과 버튼이 사라진다', async () => {
    bankFailed()
    renderApp('/admin/exchanges/62', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)
    await user.click(button('최종 실패 확정')!)
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('최종 실패 사유'), '사유')
    // 다른 관리자가 먼저 재송금했다
    adminExchangeDb.items = adminExchangeDb.items.map((x) => ({
      ...x,
      status: 'UNKNOWN',
    }))
    adminExchangeDb.payouts.push(
      payoutAttempt({
        exchangeId: 62,
        payoutId: 6,
        attemptNo: 2,
        status: 'UNKNOWN',
        requestedBy: 7,
      }),
    )

    await user.click(
      within(dialog).getByRole('button', { name: '최종 실패 확정' }),
    )

    expect(
      await screen.findByText(
        '송금 실패가 확정된 환전만 최종 실패로 끝낼 수 있어요. 최신 상태를 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await attemptRow(2)).toHaveTextContent('관리자 #7 재송금')
    expect(button('최종 실패 확정')).toBeNull()
    expect(button('결과 재확인')).toBeEnabled()
  })

  it('처리 중에는 다른 송금 처리 버튼도 꺼진다', async () => {
    bankFailed()
    let release: () => void = () => {}
    server.use(
      http.post(
        '*/api/v1/settlements/admin/exchanges/62/payouts/retry',
        async () => {
          adminExchangeDb.retryCalls.push(62)
          await new Promise<void>((r) => (release = r))
          return HttpResponse.json(
            { status: 409, code: 'EXCHANGE_PAYOUT_NOT_RETRYABLE', detail: '' },
            { status: 409 },
          )
        },
      ),
    )
    renderApp('/admin/exchanges/62', 'ADMIN')
    const user = userEvent.setup()
    await attemptRow(1)
    await user.click(button('재송금')!)
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '재송금',
      }),
    )
    await waitFor(() => expect(adminExchangeDb.retryCalls).toEqual([62]))
    await user.click(
      within(screen.getByRole('dialog'))
        .getAllByRole('button', { name: '닫기' })
        .at(-1)!,
    )

    expect(button('재송금')).toBeDisabled()
    expect(button('최종 실패 확정')).toBeDisabled()
    release()
    await settle()
    expect(adminExchangeDb.retryCalls).toEqual([62])
  })
})
