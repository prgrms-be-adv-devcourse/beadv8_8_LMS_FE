import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { meQuery, type Me } from '@/shared/auth/me'
import type { Role } from '@/shared/auth/role'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const ACCOUNTS = [
  '유저 1',
  '유저 2',
  '인플루언서 1',
  '인플루언서 2',
  '인증된 인플루언서 1',
  '인증된 인플루언서 2',
  '관리자 1',
  '관리자 2',
]

const me = (role: Role): Me => ({
  id: ME_ID,
  email: 'test@hapbang.local',
  nickname: '테스트',
  role,
  status: 'ACTIVE',
  profileImageUrl: null,
})

/** 테스트 계정 로그인 응답. 받은 요청을 calls에 남긴다. */
function mockLocalLogin(respond?: () => Response | Promise<Response>) {
  const calls: Request[] = []
  server.use(
    http.post('*/api/v1/members/local-login', async ({ request }) => {
      calls.push(request)
      if (respond) return respond()
      const role = new URL(request.url).searchParams.get('role') as Role
      return rs(me(role))
    }),
  )
  return calls
}

/** 헤더의 로그인 버튼으로 모달을 열고 테스트 계정 영역을 돌려준다. */
async function openTestAccounts() {
  await userEvent.click(
    await within(await screen.findByRole('banner')).findByRole('button', {
      name: '로그인',
    }),
  )
  const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
  return within(dialog).getByRole('group', { name: '개발용 테스트 계정' })
}

const toasts = () =>
  screen.queryAllByRole('status').filter((el) => el.classList.contains('toast'))

// 변경 요청이 CSRF 토큰을 받으려 /members/me를 따로 부르지 않게 쿠키를 둔다.
beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=t'
})

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
  vi.unstubAllEnvs()
})

describe('로그인 모달 테스트 계정 로그인', () => {
  it('운영 빌드(DEV 아님, 플래그 없음)에서는 테스트 계정 버튼이 없다', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_LOCAL_LOGIN', '')
    renderApp('/lectures', 'GUEST')
    await userEvent.click(
      await within(await screen.findByRole('banner')).findByRole('button', {
        name: '로그인',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
    expect(
      within(dialog).getByRole('button', { name: /Google로 계속하기/ }),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('group')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '유저 1' })).toBeNull()
  })

  it('dev 서버 빌드에서는 역할·번호별 버튼 8개를 보여 준다', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_LOCAL_LOGIN', 'true')
    renderApp('/lectures', 'GUEST')
    const group = await openTestAccounts()
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(ACCOUNTS)
  })

  it('인플루언서 2를 누르면 그 계정으로 로그인하고 모달을 닫은 채 그 화면에 머문다', async () => {
    const calls = mockLocalLogin()
    const router = renderApp('/lectures', 'GUEST')
    // 비회원으로 받아 둔 데이터는 로그인 뒤에 남지 않는다.
    queryClient.setQueryData(['guest-only'], 'x')
    const group = await openTestAccounts()

    await userEvent.click(
      within(group).getByRole('button', { name: '인플루언서 2' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls).toHaveLength(1)
    const params = new URL(calls[0].url).searchParams
    expect(params.get('role')).toBe('INFLUENCER')
    expect(params.get('number')).toBe('2')
    expect(calls[0].headers.get('X-XSRF-TOKEN')).toBe('t')

    expect(router.state.location.pathname).toBe('/lectures')
    const header = await screen.findByRole('banner')
    expect(
      await within(header).findByRole('link', { name: '장바구니' }),
    ).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: '로그인' })).toBeNull()
    await waitFor(() =>
      expect(toasts().map((el) => el.textContent)).toContain(
        '인플루언서 2 테스트 계정으로 로그인했어요.',
      ),
    )
    expect(queryClient.getQueryData(['guest-only'])).toBeUndefined()
  })

  it('권한이 필요한 화면에서 로그인하면 그 화면이 열린다', async () => {
    mockLocalLogin()
    const router = renderApp('/wallet', 'GUEST')
    const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
    const group = within(dialog).getByRole('group', {
      name: '개발용 테스트 계정',
    })

    await userEvent.click(within(group).getByRole('button', { name: '유저 1' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: '지갑' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/wallet')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('테스트 계정이 없으면(404) 안내하고 모달을 유지한다', async () => {
    mockLocalLogin(() =>
      HttpResponse.json(
        { statusCode: 404, message: '테스트 계정이 없습니다.', data: null },
        { status: 404 },
      ),
    )
    renderApp('/lectures', 'GUEST')
    const group = await openTestAccounts()

    await userEvent.click(
      within(group).getByRole('button', { name: '관리자 2' }),
    )

    await waitFor(() =>
      expect(toasts().map((el) => el.textContent)).toContain(
        '테스트 계정으로 로그인하지 못했어요.',
      ),
    )
    expect(
      screen.getByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
  })

  it('로그인 요청 중에는 버튼을 다시 누를 수 없다', async () => {
    const calls = mockLocalLogin(async () => {
      await delay(200)
      return rs(me('USER'))
    })
    renderApp('/lectures', 'GUEST')
    const group = await openTestAccounts()

    await userEvent.click(within(group).getByRole('button', { name: '유저 1' }))

    for (const button of within(group).getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
    await userEvent.click(within(group).getByRole('button', { name: '유저 2' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls).toHaveLength(1)
  })
})
