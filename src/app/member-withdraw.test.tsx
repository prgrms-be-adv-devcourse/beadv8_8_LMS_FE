import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { meQuery } from '@/shared/auth/me'
import { getAccessToken } from '@/shared/auth/token'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'
import { expectSuccessToast } from '@/test/toast'

/** 탈퇴 요청 수와 응답. 응답은 release를 부를 때까지 기다리게 할 수 있다 */
function mockWithdraw(respond: () => Response = () => noContent()) {
  const state = { calls: 0, release: () => {} }
  let gate: Promise<void> | null = null
  const hold = () => {
    gate = new Promise<void>((resolve) => {
      state.release = resolve
    })
  }
  server.use(
    http.delete('*/api/v1/members/me', async () => {
      state.calls++
      if (gate) await gate
      return respond()
    }),
  )
  return { state, hold }
}

const noContent = () => new HttpResponse(null, { status: 204 })

/** BE 오류 응답(ProblemDetail). extra는 오류별 속성(reasons 등) */
const problem = (
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
) =>
  HttpResponse.json(
    { status, code, detail, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

/** 동의하고 탈퇴하기를 누른다 */
async function agreeAndWithdraw() {
  const submit = await screen.findByRole('button', { name: '탈퇴하기' })
  await userEvent.click(screen.getByRole('checkbox', { name: /탈퇴할게요/ }))
  await userEvent.click(submit)
  return submit
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('계정 설정의 회원 탈퇴', () => {
  it('탈퇴 절차 보기를 누르면 탈퇴 화면으로 간다', async () => {
    const router = renderApp('/settings', 'USER')
    const section = await screen.findByRole('region', { name: '회원 탈퇴' })
    await userEvent.click(
      within(section).getByRole('link', { name: '탈퇴 절차 보기' }),
    )
    expect(router.state.location.pathname).toBe('/settings/withdraw')
    expect(
      await screen.findByRole('heading', { level: 1, name: '회원 탈퇴' }),
    ).toBeInTheDocument()
  })

  it('관리자 계정 설정에는 회원 탈퇴가 없다', async () => {
    renderApp('/settings', 'ADMIN')
    await screen.findByRole('heading', { level: 1, name: '계정 설정' })
    expect(
      screen.queryByRole('region', { name: '회원 탈퇴' }),
    ).not.toBeInTheDocument()
  })
})

describe('회원 탈퇴 화면', () => {
  it('30일 복구와 파기를 안내하고, 동의해야 탈퇴하기를 누를 수 있으며 요청 중에는 버튼을 막아 한 번만 보낸다', async () => {
    const { state, hold } = mockWithdraw()
    hold()
    renderApp('/settings/withdraw', 'USER')

    const after = await screen.findByRole('region', { name: '탈퇴하면' })
    expect(
      within(after).getByText(
        /30일 안에 다시 로그인하면 계정을 복구할 수 있어요/,
      ),
    ).toBeInTheDocument()
    expect(within(after).getByText('30일 뒤 파기돼요')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '탈퇴하기' })
    expect(submit).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: /탈퇴할게요/ }))
    expect(submit).toBeEnabled()
    await userEvent.click(submit)
    await waitFor(() => expect(submit).toBeDisabled())
    expect(state.calls).toBe(1)
    state.release()
    await waitFor(() => expect(state.calls).toBe(1))
  })

  it('탈퇴하면 토큰을 버리고 비회원이 되어 첫 화면으로 간다', async () => {
    mockWithdraw()
    const router = renderApp('/settings/withdraw', 'USER')
    await agreeAndWithdraw()

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await expectSuccessToast(
      '탈퇴했어요. 30일 안에 다시 로그인하면 복구할 수 있어요.',
    )
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
    // 첫 화면 머리에 로그인 버튼이 보인다(첫 화면은 머리 영역이 둘이다).
    expect(
      await screen.findAllByRole('button', { name: '로그인' }),
    ).not.toHaveLength(0)
    // 회원 화면을 떠나며 로그인 모달을 띄우지 않는다.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('막히면 이유를 모두 보여 주고, 기다리면 풀리는 이유는 날짜를, 정리할 곳이 있으면 바로가기를 함께 보여 준다', async () => {
    mockWithdraw(() =>
      problem(
        409,
        'WITHDRAWAL_BLOCKED',
        '탈퇴하기 전에 정리할 항목이 있어요.',
        {
          reasons: [
            {
              code: 'BILLING_CHARGE_BALANCE_REMAINING',
              message:
                '충전 HP 12,000이 남아 있어요. 환불한 뒤 탈퇴할 수 있어요.',
            },
            {
              code: 'LECTURE_ORDER_HOLDING',
              message:
                '구매한 강의 1건의 이의 제기 기간이 끝나지 않았어요. 기간이 끝난 뒤 탈퇴할 수 있어요.',
              availableAt: '2026-12-07',
            },
            { code: 'SOMETHING_NEW', message: '처음 보는 이유예요.' },
          ],
        },
      ),
    )
    const router = renderApp('/settings/withdraw', 'USER')
    const submit = await agreeAndWithdraw()

    const list = await screen.findByRole('list', {
      name: '탈퇴 전에 정리할 항목',
    })
    expect(
      screen.getByText('탈퇴하기 전에 정리할 항목이 있어요.'),
    ).toBeInTheDocument()
    const [charge, order, unknown] = within(list).getAllByRole('listitem')
    expect(charge).toHaveTextContent(
      '충전 HP 12,000이 남아 있어요. 환불한 뒤 탈퇴할 수 있어요.',
    )
    expect(within(charge).getByRole('link', { name: '지갑' })).toHaveAttribute(
      'href',
      '/wallet',
    )
    expect(order).toHaveTextContent('12/7(월) 이후 탈퇴할 수 있어요.')
    expect(
      within(order).getByRole('link', { name: '주문 내역' }),
    ).toHaveAttribute('href', '/library/orders')
    expect(unknown).toHaveTextContent('처음 보는 이유예요.')
    expect(within(unknown).queryByRole('link')).not.toBeInTheDocument()
    // 탈퇴하지 않았으니 회원으로 남아 정리한 뒤 다시 누를 수 있다.
    expect(router.state.location.pathname).toBe('/settings/withdraw')
    expect(getAccessToken()).not.toBeNull()
    expect(submit).toBeEnabled()
  })

  it.each([
    [
      409,
      'WITHDRAWAL_IN_PROGRESS',
      '이미 탈퇴를 처리하고 있어요. 결과가 나오지 않으면 2분쯤 뒤에 다시 시도해 주세요.',
    ],
    [
      503,
      'WITHDRAWAL_UNAVAILABLE',
      '지금은 탈퇴할 수 없어요. 잠시 후 다시 시도해 주세요.',
    ],
  ])(
    '%i %s면 BE 문구를 보여 주고 회원으로 남는다',
    async (status, code, detail) => {
      const { state } = mockWithdraw(() => problem(status, code, detail))
      const router = renderApp('/settings/withdraw', 'USER')
      const submit = await agreeAndWithdraw()

      expect(await screen.findByRole('alert')).toHaveTextContent(detail)
      expect(state.calls).toBe(1)
      expect(router.state.location.pathname).toBe('/settings/withdraw')
      expect(getAccessToken()).not.toBeNull()
      expect(
        screen.queryByRole('list', { name: '탈퇴 전에 정리할 항목' }),
      ).not.toBeInTheDocument()
      expect(submit).toBeEnabled()
    },
  )
})
