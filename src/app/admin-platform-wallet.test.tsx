import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { adminExchangeHandlers } from '@/test/adminExchangeMock'
import {
  feeIncome,
  platformWalletDb,
  platformWalletHandlers,
  resetPlatformWalletDb,
} from '@/test/platformWalletMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

// 플랫폼 지갑 API는 테스트 전용 목(src/test/platformWalletMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetPlatformWalletDb()
  server.use(...platformWalletHandlers)
})

afterEach(async () => {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  queryClient.clear()
})

const balance = () => screen.findByRole('region', { name: '수수료 수입 잔액' })
const table = () => screen.findByRole('table', { name: '수수료 수입 내역' })
const row = async (exchangeId: number) =>
  within(await table()).findByRole('row', {
    name: `환전 #${exchangeId} 수수료`,
  })

/** 기록 시각을 하루씩 늘린 내역 n건. exchangeId는 100부터다 */
const incomes = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    feeIncome({
      ledgerId: i + 1,
      exchangeId: 100 + i,
      recordedAt: new Date(Date.UTC(2026, 9, 1 + i, 1)).toISOString(),
    }),
  )

describe('관리자 수수료 수입', () => {
  it('운영 메뉴의 환전 승인 다음에서 들어가 잔액(HP)과 최신순 내역을 본다', async () => {
    renderApp('/admin/platform-wallet', 'ADMIN')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    const links = within(within(nav).getByRole('group', { name: '운영' }))
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(links[links.indexOf('환전 승인') + 1]).toBe('수수료 수입')
    expect(
      within(nav).getByRole('link', { name: '수수료 수입' }),
    ).toHaveAttribute('href', '/admin/platform-wallet')
    expect(
      await screen.findByRole('heading', { level: 1, name: '수수료 수입' }),
    ).toBeInTheDocument()

    expect(await balance()).toHaveTextContent('6,000HP')

    const tbl = await table()
    const headers = within(tbl)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual([
      '기록 일시',
      '환전',
      '신청 금액(HP)',
      '수수료(HP)',
      '송금액(원)',
    ])

    const rows = within(tbl).getAllByRole('row')
    // 머리글 + 2건(기록 시각 최신순)
    expect(rows).toHaveLength(3)
    const latest = await row(12)
    expect(rows[1]).toBe(latest)
    expect(
      within(latest)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['11/11(수) 11:30', '환전 #12', '50,000', '5,000', '45,000'])
    expect(
      within(latest).getByRole('link', { name: '환전 #12' }),
    ).toHaveAttribute('href', '/admin/exchanges/12')
    expect(rows[2]).toBe(await row(11))

    expect(platformWalletDb.listCalls[0]).toEqual({
      page: '0',
      size: '20',
      sort: null,
    })
  })

  it('페이지는 URL ?page=로 두고 그 페이지를 요청한다', async () => {
    resetPlatformWalletDb(incomes(25))
    const router = renderApp('/admin/platform-wallet', 'ADMIN')
    const user = userEvent.setup()
    // 최신순이라 첫 페이지 첫 줄은 마지막에 기록한 내역이다
    await row(124)

    await user.click(screen.getByRole('button', { name: '다음' }))

    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(await row(100)).toBeInTheDocument()
    expect(platformWalletDb.listCalls).toContainEqual({
      page: '1',
      size: '20',
      sort: null,
    })
  })

  it('마지막 페이지를 넘는 주소면 마지막 페이지로 옮긴다', async () => {
    const router = renderApp('/admin/platform-wallet?page=5', 'ADMIN')
    expect(await row(11)).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('내역이 없으면 빈 상태를, 잔액은 0 HP로 보여 준다', async () => {
    resetPlatformWalletDb([])
    renderApp('/admin/platform-wallet', 'ADMIN')
    expect(
      await screen.findByText('수수료 수입 내역이 없어요'),
    ).toBeInTheDocument()
    expect(await balance()).toHaveTextContent('0HP')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('내역의 환전 링크로 관리자 환전 상세를 연다', async () => {
    server.use(...adminExchangeHandlers)
    const router = renderApp('/admin/platform-wallet', 'ADMIN')
    await userEvent.click(
      within(await row(11)).getByRole('link', { name: '환전 #11' }),
    )
    expect(router.state.location.pathname).toBe('/admin/exchanges/11')
    expect(
      await screen.findByRole('heading', { level: 1, name: '환전 신청 #11' }),
    ).toBeInTheDocument()
  })

  it('잔액 조회가 거절되면(403) 잔액 자리에 실패를 보이고 내역은 그대로 보인다', async () => {
    server.use(
      http.get('*/api/v1/settlements/admin/platform-wallet', () =>
        HttpResponse.json(
          { status: 403, error: 'Forbidden', path: '/' },
          { status: 403 },
        ),
      ),
    )
    renderApp('/admin/platform-wallet', 'ADMIN')
    expect(await screen.findByText('불러오지 못했어요')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: '수수료 수입 잔액' }),
    ).toBeNull()
    expect(await row(11)).toBeInTheDocument()
  })

  it('내역을 불러오지 못하면(400) 다시 시도할 수 있다', async () => {
    let fail = true
    server.use(
      http.get('*/api/v1/settlements/admin/platform-wallet/fee-incomes', () =>
        fail
          ? HttpResponse.json(
              { status: 400, code: 'INVALID_REQUEST', detail: '잘못된 요청' },
              { status: 400 },
            )
          : undefined,
      ),
    )
    renderApp('/admin/platform-wallet', 'ADMIN')
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    expect(screen.getByText('잘못된 요청')).toBeInTheDocument()
    expect(await balance()).toHaveTextContent('6,000HP')
    fail = false
    await userEvent.click(retry)
    expect(await row(11)).toBeInTheDocument()
  })
})
