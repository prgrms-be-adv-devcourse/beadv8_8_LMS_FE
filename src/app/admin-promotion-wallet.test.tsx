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
const confirmDialog = () =>
  screen.getByRole('dialog', { name: '프로모션 HP를 충전할까요?' })

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
    // 금액은 천 단위로 끊어 보인다
    expect(screen.getByLabelText('충전 HP')).toHaveValue('500,000')
    await user.type(screen.getByLabelText('충전 근거 번호'), '결재-2026-118')
    await user.click(screen.getByRole('button', { name: '충전하기' }))

    // 바로 보내지 않고 확인 창에서 금액·근거·충전 뒤 가용 잔액을 보여 준다
    const dialog = confirmDialog()
    expect(dialog).toHaveTextContent('충전 HP500,000 HP')
    expect(dialog).toHaveTextContent('근거 번호결재-2026-118')
    expect(dialog).toHaveTextContent('지금 가용 잔액10,000 HP')
    expect(dialog).toHaveTextContent('충전 뒤 가용 잔액510,000 HP')
    expect(promotionWalletDb.fundingCalls).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: '충전' }))

    await waitFor(() => expect(promotionWalletDb.fundings).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
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

  it('응답을 받지 못한 충전을 같은 내용으로 다시 보내면 같은 작업 ID를 쓰고, 내용을 바꾸면 새 ID를 쓴다', async () => {
    const user = userEvent.setup()
    promotionWalletDb.failFundings = 2
    renderApp('/admin/promotion-wallet', 'ADMIN')
    await balance()

    await user.type(screen.getByLabelText('충전 HP'), '5000')
    await user.type(screen.getByLabelText('충전 근거 번호'), '결재-1')
    await user.click(screen.getByRole('button', { name: '충전하기' }))
    await user.click(
      within(confirmDialog()).getByRole('button', { name: '충전' }),
    )
    // 실패 사유는 확인 창 안에 남고 버튼이 다시 시도로 바뀐다
    expect(await within(confirmDialog()).findByRole('alert')).toHaveTextContent(
      /충전 결과를 확인하지 못했어요/,
    )
    expect(screen.getAllByText(/충전 결과를 확인하지 못했어요/)).toHaveLength(1)
    // 실패해도 입력은 남는다
    expect(screen.getByLabelText('충전 HP')).toHaveValue('5,000')

    // 같은 내용으로 다시 시도하면 같은 작업 ID다
    await user.click(
      within(confirmDialog()).getByRole('button', { name: '다시 시도' }),
    )
    await waitFor(() => expect(promotionWalletDb.fundingCalls).toHaveLength(2))
    const [first, second] = promotionWalletDb.fundingCalls
    expect(second.fundingWorkId).toBe(first.fundingWorkId)

    // 창을 닫으면 실패 사유는 폼 아래에 남는다
    expect(
      await within(confirmDialog()).findByRole('alert'),
    ).toBeInTheDocument()
    await user.click(
      within(confirmDialog()).getAllByRole('button', { name: '닫기' }).at(-1)!,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      /충전 결과를 확인하지 못했어요/,
    )
    // 다시 열면 아직 보내지 않은 새 확인 창이다(지난 실패를 보이지 않는다)
    await user.click(screen.getByRole('button', { name: '충전하기' }))
    expect(within(confirmDialog()).queryByRole('alert')).toBeNull()
    expect(
      within(confirmDialog()).getByRole('button', { name: '충전' }),
    ).toBeInTheDocument()
    await user.click(
      within(confirmDialog()).getAllByRole('button', { name: '닫기' }).at(-1)!,
    )
    expect(promotionWalletDb.fundingCalls).toHaveLength(2)
    // 값이 바뀌지 않는 입력(숫자가 아닌 글자)은 새 충전으로 보지 않지만, 내용을 바꾸면 새 ID다
    await user.type(screen.getByLabelText('충전 HP'), 'a')
    await user.type(screen.getByLabelText('메모 (선택)'), '11월 프로모션')
    await user.click(screen.getByRole('button', { name: '충전하기' }))
    expect(confirmDialog()).toHaveTextContent('메모11월 프로모션')
    await user.click(
      within(confirmDialog()).getByRole('button', { name: '충전' }),
    )
    await waitFor(() => expect(promotionWalletDb.fundingCalls).toHaveLength(3))
    expect(promotionWalletDb.fundingCalls[2].fundingWorkId).not.toBe(
      first.fundingWorkId,
    )
    await waitFor(async () =>
      expect(await balance()).toHaveTextContent('15,000HP'),
    )
  })

  it('안전하게 다룰 수 없는 큰 금액은 보내지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/admin/promotion-wallet', 'ADMIN')
    await balance()

    await user.type(screen.getByLabelText('충전 HP'), '9007199254740993')
    await user.type(screen.getByLabelText('충전 근거 번호'), '결재-1')
    await user.click(screen.getByRole('button', { name: '충전하기' }))

    expect(await screen.findByText('금액이 너무 커요.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(promotionWalletDb.fundingCalls).toHaveLength(0)
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
