import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { adminExchangesQuery } from '@/entities/wallet/adminExchangeApi'
import {
  adminExchange,
  adminExchangeDb,
  adminExchangeHandlers,
  resetAdminExchangeDb,
} from '@/test/adminExchangeMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

// 관리자 환전 API는 테스트 전용 목(src/test/adminExchangeMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetAdminExchangeDb()
  server.use(...adminExchangeHandlers)
  document.cookie = 'XSRF-TOKEN=t'
})

/** 처리 뒤 다시 불러오기까지 끝나야 다음 테스트로 요청이 새지 않는다(#84·#86) */
async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

afterEach(async () => {
  await settle()
  queryClient.clear()
})

const table = () => screen.findByRole('table', { name: '환전 신청 목록' })
const row = async (exchangeId: number) =>
  within(await table()).findByRole('row', { name: `환전 신청 #${exchangeId}` })
/** 상세 화면의 처리 영역. 레일 메뉴 "환전 승인"과 이름이 겹쳐 영역 안에서 찾는다 */
const actions = () => screen.findByRole('region', { name: '처리' })
const statusPill = () =>
  screen.findByText(/승인 대기|승인 · 송금 대기|거절|신청 취소/, {
    selector: '.ph-actions .pill',
  })

describe('관리자 환전 목록', () => {
  it('운영 메뉴에서 들어가 승인 대기 신청을 금액·수수료·예상 수령액·정산 예정일·신청자와 함께 본다', async () => {
    renderApp('/admin/exchanges', 'ADMIN')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '환전 승인' }),
    ).toHaveAttribute('href', '/admin/exchanges')
    expect(
      await screen.findByRole('heading', { level: 1, name: '환전 승인' }),
    ).toBeInTheDocument()

    const rows = within(await table()).getAllByRole('row')
    // 머리글 + 승인 대기 2건(오래된 신청부터)
    expect(rows).toHaveLength(3)
    const first = await row(11)
    expect(rows[1]).toBe(first)
    expect(first).toHaveTextContent('10/14(수) 10:00')
    expect(first).toHaveTextContent('별빛 · 회원 #21 · 인플루언서')
    expect(first).toHaveTextContent('10,000')
    expect(first).toHaveTextContent('−1,000')
    expect(first).toHaveTextContent('9,000')
    expect(first).toHaveTextContent('11/10(화) 예정')
    expect(within(first).getByText('승인 대기')).toHaveClass('pill', 'warn')
    expect(within(first).getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/admin/exchanges/11',
    )
    expect(within(first).queryByText('승인 불가')).toBeNull()

    const unsynced = await row(12)
    expect(unsynced).toHaveTextContent('회원 #22 · 정보 동기화 전')
    expect(within(unsynced).getByText('승인 불가')).toHaveClass('pill', 'bad')

    expect(screen.getByText('대기 2건')).toBeInTheDocument()
    expect(adminExchangeDb.listCalls[0]).toEqual({
      status: 'REQUESTED',
      page: '0',
      size: '20',
    })
  })

  it('상태를 바꾸면 URL ?status=로 두고 그 상태의 첫 페이지를 요청한다', async () => {
    // 2페이지가 있는 승인 대기 목록에서 시작한다. 범위 밖 페이지로 시작하면 페이지 보정과
    // 상태 변경이 같은 URL을 두고 겹친다(usePageParam 주석).
    resetAdminExchangeDb([
      ...Array.from({ length: 21 }, (_, i) =>
        adminExchange({
          exchangeId: 100 + i,
          requestedAt: `2026-10-${String(i + 1).padStart(2, '0')}T01:00:00Z`,
        }),
      ),
      adminExchange({ exchangeId: 13, status: 'APPROVED', approvedBy: 9 }),
    ])
    const router = renderApp('/admin/exchanges?page=2', 'ADMIN')
    const user = userEvent.setup()
    await row(120)
    const group = screen.getByRole('group', { name: '환전 상태' })
    expect(
      within(group).getByRole('button', { name: '승인 대기' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(group).getByRole('button', { name: '승인' }))

    expect(router.state.location.search).toBe('?status=APPROVED')
    // URL이 바뀐 뒤 화면이 다시 그려지기를 기다린다
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: '승인' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    const approved = await row(13)
    expect(within(approved).getByText('승인 · 송금 대기')).toBeInTheDocument()
    expect(adminExchangeDb.listCalls).toContainEqual({
      status: 'APPROVED',
      page: '0',
      size: '20',
    })
    // 머리글 건수는 상태와 관계없이 승인 대기 기준이다
    expect(screen.getByText('대기 21건')).toBeInTheDocument()
  })

  it('페이지는 URL ?page=로 두고 그 페이지를 요청한다', async () => {
    resetAdminExchangeDb(
      Array.from({ length: 25 }, (_, i) =>
        adminExchange({
          exchangeId: 100 + i,
          requestedAt: `2026-10-${String(i + 1).padStart(2, '0')}T01:00:00Z`,
        }),
      ),
    )
    const router = renderApp('/admin/exchanges', 'ADMIN')
    const user = userEvent.setup()
    await row(100)

    await user.click(screen.getByRole('button', { name: '다음' }))

    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(await row(120)).toBeInTheDocument()
    expect(adminExchangeDb.listCalls).toContainEqual({
      status: 'REQUESTED',
      page: '1',
      size: '20',
    })
  })

  it('신청이 없으면 상태에 맞는 빈 상태를 보여 준다', async () => {
    resetAdminExchangeDb([])
    renderApp('/admin/exchanges?status=REJECTED', 'ADMIN')
    expect(await screen.findByText('거절한 신청이 없어요')).toBeInTheDocument()
    expect(screen.getByText('모두 처리함')).toBeInTheDocument()
  })

  it('불러오지 못하면 다시 시도할 수 있다', async () => {
    let fail = true
    server.use(
      http.get('*/api/v1/settlements/admin/exchanges', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        if (fail && status === 'CANCELED')
          return HttpResponse.json(
            { status: 400, code: 'INVALID_REQUEST', detail: '잘못된 요청' },
            { status: 400 },
          )
        return undefined
      }),
    )
    renderApp('/admin/exchanges?status=CANCELED', 'ADMIN')
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    fail = false
    resetAdminExchangeDb([
      adminExchange({
        exchangeId: 31,
        status: 'CANCELED',
        canceledAt: '2026-10-15T00:00:00Z',
      }),
    ])
    await userEvent.click(retry)
    expect(within(await row(31)).getByText('신청 취소')).toBeInTheDocument()
  })

  it('목록에서 상세를 열 수 있다', async () => {
    const router = renderApp('/admin/exchanges', 'ADMIN')
    await userEvent.click(
      within(await row(11)).getByRole('link', { name: '상세' }),
    )
    expect(router.state.location.pathname).toBe('/admin/exchanges/11')
    expect(
      await screen.findByRole('heading', { level: 1, name: '환전 신청 #11' }),
    ).toBeInTheDocument()
  })
})

describe('관리자 환전 상세', () => {
  it('신청 당시 마스킹 계좌와 신청자의 현재 정보를 보여 준다', async () => {
    renderApp('/admin/exchanges/11', 'ADMIN')

    expect(
      await screen.findByRole('heading', { level: 1, name: '환전 신청 #11' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 환전 승인' })).toHaveAttribute(
      'href',
      '/admin/exchanges',
    )
    expect(await statusPill()).toHaveTextContent('승인 대기')
    expect(screen.getByText('004 **********1234')).toBeInTheDocument()
    expect(screen.getByText(/홍길동/)).toBeInTheDocument()
    expect(screen.getByText('11/10(화) 예정')).toBeInTheDocument()
    expect(screen.getByText('9,000원')).toBeInTheDocument()
    expect(screen.getByText(/잠정 날짜예요/)).toBeInTheDocument()

    const applicant = screen.getByRole('region', { name: '신청자' })
    expect(applicant).toHaveTextContent('별빛')
    expect(applicant).toHaveTextContent('회원 #21')
    expect(applicant).toHaveTextContent('인플루언서')
    expect(applicant).toHaveTextContent('정상')

    const region = await actions()
    expect(within(region).getByRole('button', { name: '승인' })).toBeEnabled()
    expect(within(region).getByRole('button', { name: '거절' })).toBeEnabled()
  })

  it('없는 신청이면(404) 안내한다', async () => {
    renderApp('/admin/exchanges/999', 'ADMIN')
    expect(
      await screen.findByText(/찾을 수 없|불러오지 못/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← 환전 승인' }),
    ).toBeInTheDocument()
  })

  it('처리한 신청은 처리 기록을 보여 주고 승인·거절 버튼이 없다', async () => {
    resetAdminExchangeDb([
      adminExchange({
        exchangeId: 41,
        status: 'REJECTED',
        rejectedBy: 9,
        rejectedAt: '2026-10-15T05:00:00Z',
        rejectionReason: '예금주가 신청자와 달라요',
      }),
    ])
    renderApp('/admin/exchanges/41', 'ADMIN')

    expect(await statusPill()).toHaveTextContent('거절')
    const history = screen.getByRole('region', { name: '처리 기록' })
    expect(history).toHaveTextContent('10/15(목) 14:00')
    expect(history).toHaveTextContent('관리자 #9')
    expect(history).toHaveTextContent('예금주가 신청자와 달라요')
    expect(screen.queryByRole('region', { name: '처리' })).toBeNull()
  })

  it.each([
    {
      case: '동기화 전',
      applicant: null,
      reason: '신청자 회원 정보가 아직 반영되지 않아 승인할 수 없어요.',
      shown: '정보 동기화 전',
    },
    {
      case: '정지된',
      applicant: {
        nickname: '별빛',
        role: 'INFLUENCER' as const,
        status: 'SUSPENDED' as const,
        approvable: false,
      },
      reason: '정상 상태의 인플루언서가 아니라 승인할 수 없어요(정지).',
      shown: '정지',
    },
  ])(
    '$case 신청자는 승인 버튼이 꺼지고 이유를 보여 주지만 거절할 수 있다',
    async ({ applicant, reason, shown }) => {
      resetAdminExchangeDb([adminExchange({ exchangeId: 12, applicant })])
      renderApp('/admin/exchanges/12', 'ADMIN')

      const region = await actions()
      expect(region).toHaveTextContent(reason)
      expect(
        within(region).getByRole('button', { name: '승인' }),
      ).toBeDisabled()
      expect(within(region).getByRole('button', { name: '거절' })).toBeEnabled()
      expect(screen.getByRole('region', { name: '신청자' })).toHaveTextContent(
        shown,
      )
    },
  )
})

describe('관리자 환전 승인·거절', () => {
  it('승인하면 확인을 거쳐 승인으로 바뀌고 목록·대시보드 건수를 무효화한다', async () => {
    const router = renderApp('/admin/exchanges', 'ADMIN')
    const user = userEvent.setup()
    await user.click(within(await row(11)).getByRole('link', { name: '상세' }))

    await user.click(
      within(await actions()).getByRole('button', { name: '승인' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '환전 신청을 승인할까요?',
    })
    expect(dialog).toHaveTextContent('별빛 · 회원 #21 · 인플루언서')
    expect(dialog).toHaveTextContent('10,000 HP')
    expect(dialog).toHaveTextContent('9,000원')
    expect(dialog).toHaveTextContent('004 **********1234 · 홍길동')
    expect(dialog).toHaveTextContent(
      '승인해도 바로 송금하지 않아요. 보류한 수익 HP는 그대로 두고, 송금은 정산 처리에서 해요. 승인한 뒤에는 회원이 신청을 취소할 수 없어요.',
    )
    expect(adminExchangeDb.approveCalls).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: '승인' }))

    expect(
      await screen.findByText(
        '환전 신청을 승인했어요. 송금은 정산 처리에서 해요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await statusPill()).toHaveTextContent('승인 · 송금 대기')
    expect(screen.queryByRole('region', { name: '처리' })).toBeNull()
    expect(screen.getByRole('region', { name: '처리 기록' })).toHaveTextContent(
      '관리자 #1',
    )
    expect(adminExchangeDb.approveCalls).toEqual([11])
    // 목록(=대시보드 카드와 같은 쿼리)을 무효화해 다시 열면 새로 부른다
    await waitFor(() =>
      expect(
        queryClient.getQueryState(adminExchangesQuery('REQUESTED', 0).queryKey)
          ?.isInvalidated,
      ).toBe(true),
    )

    await user.click(screen.getByRole('link', { name: '← 환전 승인' }))
    expect(router.state.location.pathname).toBe('/admin/exchanges')
    await waitFor(async () =>
      expect(within(await table()).getAllByRole('row')).toHaveLength(2),
    )
  })

  it('거절 사유를 입력해 거절하면 사유와 함께 거절로 바뀐다', async () => {
    renderApp('/admin/exchanges/11', 'ADMIN')
    const user = userEvent.setup()
    await user.click(
      within(await actions()).getByRole('button', { name: '거절' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '환전 신청을 거절할까요?',
    })
    const submit = within(dialog).getByRole('button', { name: '거절' })
    expect(submit).toBeDisabled()
    expect(dialog).toHaveTextContent('0/500 · 신청자에게 보여요')

    const input = within(dialog).getByLabelText('거절 사유')
    await user.type(input, '   ')
    expect(submit).toBeDisabled()
    await user.type(input, '예금주가 달라요  ')
    expect(dialog).toHaveTextContent('8/500')
    await user.click(submit)

    expect(
      await screen.findByText(
        '환전 신청을 거절했어요. 보류한 수익 HP는 신청자에게 돌아가요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await statusPill()).toHaveTextContent('거절')
    expect(screen.getByRole('region', { name: '처리 기록' })).toHaveTextContent(
      '예금주가 달라요',
    )
    expect(adminExchangeDb.rejectCalls).toEqual([
      { exchangeId: 11, body: { rejectionReason: '예금주가 달라요' } },
    ])
  })

  it('거절 사유가 500자를 넘으면 보낼 수 없다', async () => {
    renderApp('/admin/exchanges/11', 'ADMIN')
    const user = userEvent.setup()
    await user.click(
      within(await actions()).getByRole('button', { name: '거절' }),
    )
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByLabelText('거절 사유'))
    await user.paste('가'.repeat(501))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '거절 사유는 500자까지 입력할 수 있어요.',
    )
    expect(within(dialog).getByRole('button', { name: '거절' })).toBeDisabled()
  })

  it('BE가 사유 형식을 거절하면(400) 모달에 오류를 보여 준다', async () => {
    server.use(
      http.post('*/api/v1/settlements/admin/exchanges/11/reject', () =>
        HttpResponse.json(
          {
            status: 400,
            code: 'EXCHANGE_REJECTION_REASON_INVALID',
            detail: '거절 사유는 앞뒤 공백을 빼고 1~500자여야 합니다.',
          },
          { status: 400 },
        ),
      ),
    )
    renderApp('/admin/exchanges/11', 'ADMIN')
    const user = userEvent.setup()
    await user.click(
      within(await actions()).getByRole('button', { name: '거절' }),
    )
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('거절 사유'), '사유')
    await user.click(within(dialog).getByRole('button', { name: '거절' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '거절 사유는 앞뒤 공백을 빼고 1~500자여야 해요.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('이미 처리·취소된 신청이면(409) 안내하고 최신 상태를 다시 불러온다', async () => {
    renderApp('/admin/exchanges/11', 'ADMIN')
    const user = userEvent.setup()
    const region = await actions()
    // 화면을 연 뒤 회원이 취소했다
    adminExchangeDb.items = adminExchangeDb.items.map((x) =>
      x.exchangeId === 11
        ? { ...x, status: 'CANCELED', canceledAt: '2026-10-16T05:00:00Z' }
        : x,
    )
    await user.click(within(region).getByRole('button', { name: '승인' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '승인' }),
    )

    expect(
      await screen.findByText(
        '이미 처리됐거나 회원이 취소한 신청이에요. 최신 상태를 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(async () =>
      expect(await statusPill()).toHaveTextContent('신청 취소'),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('region', { name: '처리' })).toBeNull()
  })

  it('승인 중 자격이 바뀌면(409) 안내하고 승인 버튼을 끈다', async () => {
    renderApp('/admin/exchanges/11', 'ADMIN')
    const user = userEvent.setup()
    const region = await actions()
    adminExchangeDb.items = adminExchangeDb.items.map((x) =>
      x.exchangeId === 11
        ? {
            ...x,
            applicant: {
              nickname: '별빛',
              role: 'INFLUENCER',
              status: 'SUSPENDED',
              approvable: false,
            },
          }
        : x,
    )
    await user.click(within(region).getByRole('button', { name: '승인' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '승인' }),
    )

    expect(
      await screen.findByText(
        '신청자가 정상 상태의 인플루언서가 아니라 승인할 수 없어요. 최신 상태를 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(async () =>
      expect(
        within(await actions()).getByRole('button', { name: '승인' }),
      ).toBeDisabled(),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('처리 중에는 모달을 닫고 다시 열어도 또 보내지 못한다', async () => {
    let release: () => void = () => {}
    server.use(
      http.post('*/api/v1/settlements/admin/exchanges/11/approve', async () => {
        adminExchangeDb.approveCalls.push(11)
        await new Promise<void>((r) => (release = r))
        return HttpResponse.json(
          { status: 409, code: 'EXCHANGE_ALREADY_REVIEWED', detail: '' },
          { status: 409 },
        )
      }),
    )
    renderApp('/admin/exchanges/11', 'ADMIN')
    const user = userEvent.setup()
    await user.click(
      within(await actions()).getByRole('button', { name: '승인' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '승인' }),
    )
    await waitFor(() => expect(adminExchangeDb.approveCalls).toEqual([11]))
    // 머리글 ✕와 아래 닫기 버튼 중 아래 것
    await user.click(
      within(screen.getByRole('dialog'))
        .getAllByRole('button', { name: '닫기' })
        .at(-1)!,
    )

    const region = await actions()
    expect(within(region).getByRole('button', { name: '승인' })).toBeDisabled()
    expect(within(region).getByRole('button', { name: '거절' })).toBeDisabled()
    release()
    await settle()
    expect(adminExchangeDb.approveCalls).toEqual([11])
  })
})

describe('관리자 환전 접근', () => {
  it.each(['/admin/exchanges', '/admin/exchanges/11'])(
    '관리자가 아니면 %s를 열 수 없고 관리 API를 부르지 않는다',
    async (path) => {
      renderApp(path, 'VERIFIED_INFLUENCER')
      expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '환전 승인' })).toBeNull()
      expect(adminExchangeDb.listCalls).toEqual([])
    },
  )
})
