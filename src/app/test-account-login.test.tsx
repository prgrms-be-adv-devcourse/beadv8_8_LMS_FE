import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { meQuery, type Me } from '@/shared/auth/me'
import type { Role } from '@/shared/auth/role'
import { getAccessToken } from '@/shared/auth/token'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

/** 버튼 이름과 BE 초기 계정(MemberSeedAccountUseCase) */
const ACCOUNTS: [string, string, Role][] = [
  ['인플루언서', 'influencer@hapbang.local', 'INFLUENCER'],
  [
    '인증된 인플루언서',
    'verified-influencer@hapbang.local',
    'VERIFIED_INFLUENCER',
  ],
  ['관리자', 'admin@hapbang.local', 'ADMIN'],
]
const ROLE_OF: Record<string, Role> = Object.fromEntries(
  ACCOUNTS.map(([, email, role]) => [email, role]),
)

const me = (role: Role): Me => ({
  id: ME_ID,
  email: 'test@hapbang.local',
  nickname: '테스트',
  role,
  status: 'ACTIVE',
  profileImageUrl: null,
})

const LOCAL_TOKEN = 'local-access-token'

/**
 * 이메일·비밀번호 로그인 응답. 받은 본문을 calls에 남긴다.
 * BE는 refresh token 쿠키만 주므로 이어서 부르는 재발급이 access token을 준다.
 */
function mockLogin(respond?: () => Response | Promise<Response>) {
  const calls: { email: string; password: string }[] = []
  server.use(
    http.post('*/api/v1/members/auth/refresh', () =>
      rs({ accessToken: LOCAL_TOKEN, expiresIn: 900 }),
    ),
    http.post('*/api/v1/members/login', async ({ request }) => {
      const body = (await request.json()) as { email: string; password: string }
      calls.push(body)
      if (respond) return respond()
      return rs(me(ROLE_OF[body.email]))
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
    expect(within(dialog).queryByRole('button', { name: '관리자' })).toBeNull()
  })

  it('dev 서버 빌드에서는 초기 계정이 있는 역할의 버튼 3개를 보여 준다(유저는 없다)', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_LOCAL_LOGIN', 'true')
    renderApp('/lectures', 'GUEST')
    const group = await openTestAccounts()
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(ACCOUNTS.map(([label]) => label))
  })

  it.each(ACCOUNTS)(
    '%s 버튼을 누르면 그 초기 계정(%s)으로 이메일 로그인하고 모달을 닫은 채 그 화면에 머문다',
    async (label, email) => {
      const calls = mockLogin()
      const router = renderApp('/lectures', 'GUEST')
      // 비회원으로 받아 둔 데이터는 로그인 뒤에 남지 않는다.
      queryClient.setQueryData(['guest-only'], 'x')
      const group = await openTestAccounts()

      await userEvent.click(within(group).getByRole('button', { name: label }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(calls).toEqual([{ email, password: 'hapbang1234!' }])
      // 재발급으로 받은 access token을 이 탭 메모리에 둔다.
      expect(getAccessToken()).toBe(LOCAL_TOKEN)

      expect(router.state.location.pathname).toBe('/lectures')
      const header = await screen.findByRole('banner')
      expect(
        within(header).queryByRole('button', { name: '로그인' }),
      ).toBeNull()
      await waitFor(() =>
        expect(toasts().map((el) => el.textContent)).toContain(
          `${label} 테스트 계정으로 로그인했어요.`,
        ),
      )
      expect(queryClient.getQueryData(['guest-only'])).toBeUndefined()
    },
  )

  it('권한이 필요한 화면에서 로그인하면 그 화면이 열린다', async () => {
    mockLogin()
    const router = renderApp('/wallet', 'GUEST')
    const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
    const group = within(dialog).getByRole('group', {
      name: '개발용 테스트 계정',
    })

    await userEvent.click(
      within(group).getByRole('button', { name: '인플루언서' }),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: '지갑' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/wallet')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('로그인하지 못하면(초기 계정 비밀번호를 바꾼 경우 401 등) 안내하고 모달을 유지한다', async () => {
    mockLogin(() =>
      HttpResponse.json(
        {
          status: 401,
          code: 'INVALID_CREDENTIALS',
          detail: '이메일 또는 비밀번호가 올바르지 않습니다.',
        },
        { status: 401 },
      ),
    )
    renderApp('/lectures', 'GUEST')
    const group = await openTestAccounts()

    await userEvent.click(within(group).getByRole('button', { name: '관리자' }))

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
    const calls = mockLogin(async () => {
      await delay(200)
      return rs(me('INFLUENCER'))
    })
    renderApp('/lectures', 'GUEST')
    const group = await openTestAccounts()

    await userEvent.click(
      within(group).getByRole('button', { name: '인플루언서' }),
    )

    for (const button of within(group).getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
    await userEvent.click(within(group).getByRole('button', { name: '관리자' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls).toHaveLength(1)
  })
})
