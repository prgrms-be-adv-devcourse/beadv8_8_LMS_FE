import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  promotionWalletDb,
  promotionWalletHandlers,
  resetPromotionWalletDb,
} from '@/test/promotionWalletMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

// 프로모션 지갑 API는 테스트 전용 목(src/test/promotionWalletMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetPromotionWalletDb({ availableHp: 10000, reservedHp: 3000, heldHp: 500 })
  server.use(...promotionWalletHandlers)
})

afterEach(async () => {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  queryClient.clear()
})

const balance = () =>
  screen.findByRole('region', { name: '프로모션 지갑 잔액' })

describe('관리자 프로모션 지갑', () => {
  it('운영 메뉴의 수수료 수입 다음에서 들어가 칸별 잔액을 본다', async () => {
    renderApp('/admin/promotion-wallet', 'ADMIN')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    const links = within(within(nav).getByRole('group', { name: '운영' }))
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(links[links.indexOf('수수료 수입') + 1]).toBe('프로모션 지갑')
    expect(
      await screen.findByRole('heading', { level: 1, name: '프로모션 지갑' }),
    ).toBeInTheDocument()

    expect(await balance()).toHaveTextContent('10,000HP')
    expect(await balance()).toHaveTextContent('예약 3,000 HP')
    expect(await balance()).toHaveTextContent('보류 500 HP')
  })

  it('금액과 근거 번호를 적어 충전하면 관리자 발행으로 보내고 가용 잔액이 늘어난다', async () => {
    const user = userEvent.setup()
    renderApp('/admin/promotion-wallet', 'ADMIN')
    await balance()

    await user.type(screen.getByLabelText('충전 HP'), '500000')
    await user.type(screen.getByLabelText('충전 근거 번호'), '결재-2026-118')
    await user.click(screen.getByRole('button', { name: '충전하기' }))

    await waitFor(() => expect(promotionWalletDb.fundings).toHaveLength(1))
    expect(promotionWalletDb.fundings[0]).toMatchObject({
      amountHp: 500000,
      sourceType: 'ADMIN_GRANT',
      sourceRef: '결재-2026-118',
    })
    expect(promotionWalletDb.fundings[0].fundingWorkId).toMatch(
      /^[A-Za-z0-9_-]{1,200}$/,
    )
    await waitFor(async () =>
      expect(await balance()).toHaveTextContent('510,000HP'),
    )
    expect(screen.getByLabelText('충전 HP')).toHaveValue('')
  })

  it('금액이나 근거 번호가 비면 보내지 않고 칸 아래에 알린다', async () => {
    const user = userEvent.setup()
    renderApp('/admin/promotion-wallet', 'ADMIN')
    await balance()

    await user.click(screen.getByRole('button', { name: '충전하기' }))

    expect(
      await screen.findByText('충전할 HP를 1 이상으로 적어 주세요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('충전 근거 번호를 적어 주세요.'),
    ).toBeInTheDocument()
    expect(promotionWalletDb.fundings).toHaveLength(0)
  })
})
