import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Me } from '@/shared/auth/me'
import { getAccessToken } from '@/shared/auth/token'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const me: Me = {
  id: ME_ID,
  email: 'user@hapbang.kr',
  nickname: '하늘',
  role: 'USER',
  status: 'ACTIVE',
  profileImageUrl: null,
}

/** BE 오류 응답(ProblemDetail). extra는 오류별 속성(restorableUntil 등) */
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

const noContent = () => new HttpResponse(null, { status: 204 })

/** BE가 주는 복구 기한(LocalDateTime). 소수점 아래 초가 붙어 온다 */
const RESTORABLE_UNTIL = '2026-12-05T10:00:00.123456'
const RESTORABLE_TEXT =
  '탈퇴한 계정이에요. 12/5(토) 10:00까지 복구할 수 있어요.'

const restorable = () =>
  problem(
    409,
    'WITHDRAWN_RESTORABLE',
    '탈퇴한 계정이에요. 복구하면 다시 이용할 수 있어요.',
    { restorableUntil: RESTORABLE_UNTIL },
  )

const toasts = () =>
  screen.queryAllByRole('status').filter((el) => el.classList.contains('toast'))

/** 헤더의 로그인 버튼으로 모달을 연다 */
async function openLogin() {
  await userEvent.click(
    await within(await screen.findByRole('banner')).findByRole('button', {
      name: '로그인',
    }),
  )
  return screen.findByRole('dialog', { name: '합방 시작하기' })
}

/** 이메일 로그인 폼에 적고 로그인한다 */
async function passwordLogin(dialog: HTMLElement) {
  const form = within(dialog).getByRole('form', { name: '이메일로 로그인' })
  await userEvent.type(within(form).getByLabelText('이메일'), 'user@hapbang.kr')
  await userEvent.type(within(form).getByLabelText('비밀번호'), 'abcd1234')
  await userEvent.click(
    within(form).getByRole('button', { name: '이메일로 로그인' }),
  )
}

/** 복구 요청·취소 응답과 횟수 */
function mockRestore(respond: () => Response = noContent) {
  const state = { restores: 0, cancels: 0, refreshes: 0 }
  server.use(
    http.post('*/api/v1/members/restore', () => {
      state.restores++
      return respond()
    }),
    http.delete('*/api/v1/members/restore', () => {
      state.cancels++
      return noContent()
    }),
  )
  return state
}

afterEach(() => {
  queryClient.clear()
  vi.unstubAllGlobals()
  closeLoginModal()
})

describe('비밀번호 로그인한 탈퇴 회원 복구', () => {
  it('탈퇴한 계정으로 비밀번호 로그인하면 복구 기한과 함께 복구할지 묻는다', async () => {
    mockRestore()
    server.use(http.post('*/api/v1/members/login', restorable))
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await passwordLogin(dialog)

    const prompt = await within(dialog).findByRole('group', {
      name: '계정 복구',
    })
    expect(prompt).toHaveTextContent(RESTORABLE_TEXT)
    expect(prompt).toHaveTextContent('복구할까요?')
    expect(
      within(prompt).getByRole('button', { name: '복구하기' }),
    ).toBeInTheDocument()
    expect(
      within(prompt).getByRole('button', { name: '복구하지 않기' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('form', { name: '이메일로 로그인' }),
    ).not.toBeInTheDocument()
  })

  it('복구하면 같은 이메일·비밀번호로 다시 로그인해 회원이 된다', async () => {
    const restore = mockRestore()
    const bodies: unknown[] = []
    server.use(
      http.post('*/api/v1/members/login', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1 ? restorable() : rs(me)
      }),
      http.post('*/api/v1/members/auth/refresh', () => {
        restore.refreshes++
        return rs({ accessToken: 'restored-token', expiresIn: 900 })
      }),
    )
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await passwordLogin(dialog)
    const prompt = await within(dialog).findByRole('group', {
      name: '계정 복구',
    })
    await userEvent.click(
      within(prompt).getByRole('button', { name: '복구하기' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(restore.restores).toBe(1)
    expect(restore.cancels).toBe(0)
    const credentials = { email: 'user@hapbang.kr', password: 'abcd1234' }
    expect(bodies).toEqual([credentials, credentials])
    expect(getAccessToken()).toBe('restored-token')
    expect(
      await within(screen.getByRole('banner')).findByRole('button', {
        name: '하늘 메뉴',
      }),
    ).toBeInTheDocument()
    expect(toasts().map((el) => el.textContent)).toContain(
      '계정을 복구하고 로그인했어요.',
    )
    // 복구한 화면에 그대로 머문다.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('강의')
  })

  it('복구하지 않으면 복구 티켓을 지우고 이메일을 채운 로그인 화면으로 돌아간다', async () => {
    const restore = mockRestore()
    server.use(http.post('*/api/v1/members/login', restorable))
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await passwordLogin(dialog)
    const prompt = await within(dialog).findByRole('group', {
      name: '계정 복구',
    })
    await userEvent.click(
      within(prompt).getByRole('button', { name: '복구하지 않기' }),
    )

    const form = await within(dialog).findByRole('form', {
      name: '이메일로 로그인',
    })
    expect(restore.cancels).toBe(1)
    expect(restore.restores).toBe(0)
    expect(within(form).getByLabelText('이메일')).toHaveValue('user@hapbang.kr')
    expect(getAccessToken()).toBeNull()
  })
})

describe('복구 질문 닫기', () => {
  it('고르지 않고 모달을 닫으면 복구하지 않은 것으로 보고 복구 티켓을 지운다', async () => {
    const restore = mockRestore()
    server.use(http.post('*/api/v1/members/login', restorable))
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await passwordLogin(dialog)
    await within(dialog).findByRole('group', { name: '계정 복구' })
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(restore.cancels).toBe(1))
    expect(restore.restores).toBe(0)
  })

  it('복구하지 않기를 고른 뒤 닫으면 다시 지우지 않는다', async () => {
    const restore = mockRestore()
    server.use(http.post('*/api/v1/members/login', restorable))
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await passwordLogin(dialog)
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '복구하지 않기' }),
    )
    await within(dialog).findByRole('form', { name: '이메일로 로그인' })
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(restore.cancels).toBe(1)
  })
})

describe('복구 실패', () => {
  /** 비밀번호로 로그인해 복구 질문까지 간다. 두 번째 로그인부터는 성공한다 */
  async function askRestore() {
    let logins = 0
    server.use(
      http.post('*/api/v1/members/login', () =>
        ++logins === 1 ? restorable() : rs(me),
      ),
    )
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await passwordLogin(dialog)
    const prompt = await within(dialog).findByRole('group', {
      name: '계정 복구',
    })
    return { dialog, prompt }
  }

  /** 재발급 횟수. 비회원이라 기본처럼 거절한다 */
  function countRefresh(state: { refreshes: number }) {
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        state.refreshes++
        return problem(401, 'INVALID_REFRESH_TOKEN', '다시 로그인해 주세요.')
      }),
    )
  }

  it.each([
    [
      401,
      'INVALID_RESTORE_TICKET',
      '복구 요청이 만료됐어요. 다시 로그인해 주세요.',
      '복구 요청이 만료됐어요. 다시 로그인해 주세요.',
    ],
    [
      403,
      'LOGIN_NOT_ALLOWED',
      '탈퇴했거나 이용할 수 없는 회원입니다.',
      '복구 기한이 지나 계정을 복구할 수 없어요.',
    ],
  ])(
    '%i %s면 토큰을 다시 받지 않고 이메일을 채운 로그인 화면에 이유를 보여 준다',
    async (status, code, detail, shown) => {
      const restore = mockRestore(() => problem(status, code, detail))
      countRefresh(restore)
      const { dialog, prompt } = await askRestore()
      await userEvent.click(
        within(prompt).getByRole('button', { name: '복구하기' }),
      )

      const form = await within(dialog).findByRole('form', {
        name: '이메일로 로그인',
      })
      expect(within(dialog).getByRole('alert')).toHaveTextContent(shown)
      expect(within(form).getByLabelText('이메일')).toHaveValue(
        'user@hapbang.kr',
      )
      expect(restore.restores).toBe(1)
      // 복구 실패를 로그인 만료로 보고 재발급하거나 '로그인이 필요해요.'로 덮지 않는다.
      expect(restore.refreshes).toBe(0)
      expect(within(dialog).queryByText('로그인이 필요해요.')).toBeNull()
    },
  )

  it('지금 복구할 수 없으면(503) 같은 화면에 알리고, 다시 누르면 복구해 로그인한다', async () => {
    let attempts = 0
    const restore = mockRestore(() =>
      ++attempts === 1
        ? problem(
            503,
            'RESTORE_UNAVAILABLE',
            '지금은 복구할 수 없어요. 잠시 후 다시 시도해 주세요.',
          )
        : noContent(),
    )
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        rs({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    )
    const { prompt } = await askRestore()
    const yes = within(prompt).getByRole('button', { name: '복구하기' })
    await userEvent.click(yes)

    expect(await within(prompt).findByRole('alert')).toHaveTextContent(
      '지금은 복구할 수 없어요. 잠시 후 다시 시도해 주세요.',
    )
    expect(yes).toBeEnabled()
    await userEvent.click(yes)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(restore.restores).toBe(2)
    expect(getAccessToken()).toBe('restored-token')
  })
})

describe('구글 로그인한 탈퇴 회원 복구', () => {
  const GOOGLE_LOGIN_URL = '/api/v1/members/oauth2/authorization/google'
  const failurePath = `/login?error=WITHDRAWN_RESTORABLE&restorableUntil=${RESTORABLE_UNTIL}`

  it('탈퇴 계정으로 돌아오면 같은 질문을 띄우고, 복구하면 로그인 전에 보던 화면으로 돌아오게 구글 로그인으로 다시 보낸다', async () => {
    const restore = mockRestore()
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    sessionStorage.setItem('hapbang.returnTo', '/lectures/3')
    renderApp(failurePath, 'GUEST')

    const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
    const prompt = await within(dialog).findByRole('group', {
      name: '계정 복구',
    })
    expect(prompt).toHaveTextContent(RESTORABLE_TEXT)
    await userEvent.click(
      within(prompt).getByRole('button', { name: '복구하기' }),
    )

    await waitFor(() => expect(assign).toHaveBeenCalledWith(GOOGLE_LOGIN_URL))
    expect(restore.restores).toBe(1)
    expect(sessionStorage.getItem('hapbang.returnTo')).toBe('/lectures/3')
    // 구글 로그인 화면으로 가는 동안 다시 누르지 않게 둔다.
    expect(
      within(prompt).getByRole('button', { name: '복구하기' }),
    ).toBeDisabled()
  })

  it('복구하지 않으면 복구 티켓을 지우고 로그인 화면을 보여 준다', async () => {
    const restore = mockRestore()
    renderApp(failurePath, 'GUEST')

    const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '복구하지 않기' }),
    )

    expect(
      await within(dialog).findByRole('button', { name: /Google로 계속하기/ }),
    ).toBeInTheDocument()
    expect(restore.cancels).toBe(1)
    expect(restore.restores).toBe(0)
  })
})
