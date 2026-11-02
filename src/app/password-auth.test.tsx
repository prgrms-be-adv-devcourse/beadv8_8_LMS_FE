import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Me } from '@/shared/auth/me'
import { getAccessToken } from '@/shared/auth/token'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const me = (patch: Partial<Me> = {}): Me => ({
  id: ME_ID,
  email: 'user@hapbang.kr',
  nickname: '하늘',
  role: 'USER',
  status: 'ACTIVE',
  profileImageUrl: null,
  ...patch,
})

/** BE 오류 응답(ProblemDetail) */
const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json(
    { status, code, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
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

/** 재발급 응답과 횟수 */
function mockRefresh() {
  const state = { calls: 0 }
  server.use(
    http.post('*/api/v1/members/auth/refresh', () => {
      state.calls++
      return rs({ accessToken: 'password-token', expiresIn: 900 })
    }),
  )
  return state
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('이메일 로그인', () => {
  it('이메일·비밀번호로 로그인하면 토큰을 받아 회원이 되고 모달을 닫는다', async () => {
    const refresh = mockRefresh()
    let body: unknown
    server.use(
      http.post('*/api/v1/members/login', async ({ request }) => {
        body = await request.json()
        return rs(me())
      }),
    )
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    const form = within(dialog).getByRole('form', { name: '이메일로 로그인' })

    await userEvent.type(
      within(form).getByLabelText('이메일'),
      ' user@hapbang.kr ',
    )
    await userEvent.type(within(form).getByLabelText('비밀번호'), 'abcd1234')
    await userEvent.click(
      within(form).getByRole('button', { name: '이메일로 로그인' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(body).toEqual({ email: 'user@hapbang.kr', password: 'abcd1234' })
    expect(refresh.calls).toBe(1)
    expect(getAccessToken()).toBe('password-token')
    expect(
      await within(screen.getByRole('banner')).findByRole('button', {
        name: '하늘 메뉴',
      }),
    ).toBeInTheDocument()
    expect(toasts().map((el) => el.textContent)).toContain('로그인했어요.')
  })

  it.each([
    [401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.'],
    [
      429,
      'LOGIN_LOCKED',
      '로그인에 여러 번 실패했어요. 15분 뒤에 다시 시도해 주세요.',
    ],
    [403, 'LOGIN_NOT_ALLOWED', '탈퇴했거나 이용할 수 없는 회원입니다.'],
  ])(
    '%d %s면 재발급 없이 BE 문구를 폼에 보여 주고 모달을 유지한다',
    async (status, code, detail) => {
      const refresh = mockRefresh()
      server.use(
        http.post('*/api/v1/members/login', () =>
          problem(status, code, detail),
        ),
      )
      renderApp('/lectures', 'GUEST')
      const dialog = await openLogin()
      const form = within(dialog).getByRole('form', { name: '이메일로 로그인' })

      await userEvent.type(within(form).getByLabelText('이메일'), 'a@b.kr')
      await userEvent.type(within(form).getByLabelText('비밀번호'), 'wrong123')
      await userEvent.click(
        within(form).getByRole('button', { name: '이메일로 로그인' }),
      )

      expect(await within(form).findByRole('alert')).toHaveTextContent(detail)
      expect(refresh.calls).toBe(0)
      expect(
        screen.getByRole('dialog', { name: '합방 시작하기' }),
      ).toBeInTheDocument()
    },
  )

  it('비어 있으면 요청하지 않고 첫 빈 칸을 알려 준다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/members/login', () => {
        calls++
        return rs(me())
      }),
    )
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    const form = within(dialog).getByRole('form', { name: '이메일로 로그인' })

    await userEvent.click(
      within(form).getByRole('button', { name: '이메일로 로그인' }),
    )

    expect(
      await within(form).findByText('이메일을 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(within(form).getByLabelText('이메일')).toHaveFocus()
    expect(calls).toBe(0)
  })

  it('비밀번호로 가입된 이메일로 구글 로그인에 실패해 돌아오면 이유와 이메일 로그인 폼을 보여 준다', async () => {
    renderApp('/login?error=EMAIL_REGISTERED_WITH_PASSWORD', 'GUEST')
    const dialog = await screen.findByRole('dialog', { name: '합방 시작하기' })
    expect(
      within(dialog).getByText(
        '이미 비밀번호로 가입된 이메일입니다. 이메일과 비밀번호로 로그인해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('form', { name: '이메일로 로그인' }),
    ).toBeInTheDocument()
  })
})

describe('이메일 가입', () => {
  it('규칙을 어기면 BE와 같은 문구로 막고, 가입하면 로그인으로 돌아와 이메일을 채워 둔다', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v1/members/signup', async ({ request }) => {
        body = await request.json()
        return rs(me({ email: 'new@hapbang.kr', nickname: '새벽' }), 201)
      }),
    )
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '이메일로 가입하기' }),
    )
    const form = within(dialog).getByRole('form', { name: '이메일로 가입' })
    const password = within(form).getByLabelText('비밀번호')

    await userEvent.type(
      within(form).getByLabelText('이메일'),
      'new@hapbang.kr',
    )
    await userEvent.type(password, 'abcdefgh')
    await userEvent.tab()
    expect(
      await within(form).findByText(
        '비밀번호에 영문과 숫자를 하나 이상씩 넣어 주세요.',
      ),
    ).toBeInTheDocument()

    await userEvent.clear(password)
    await userEvent.type(password, 'abcd1234')
    await userEvent.type(
      within(form).getByLabelText('비밀번호 확인'),
      'abcd1235',
    )
    await userEvent.type(within(form).getByLabelText('닉네임'), '새벽')
    await userEvent.click(
      within(form).getByRole('button', { name: '가입하기' }),
    )
    expect(
      await within(form).findByText('비밀번호가 서로 달라요.'),
    ).toBeInTheDocument()
    expect(body).toBeUndefined()

    const confirm = within(form).getByLabelText('비밀번호 확인')
    await userEvent.clear(confirm)
    await userEvent.type(confirm, 'abcd1234')
    await userEvent.click(
      within(form).getByRole('button', { name: '가입하기' }),
    )

    expect(
      await within(dialog).findByText(
        '가입했어요. 이메일과 비밀번호로 로그인해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(body).toEqual({
      email: 'new@hapbang.kr',
      password: 'abcd1234',
      nickname: '새벽',
    })
    const login = within(dialog).getByRole('form', { name: '이메일로 로그인' })
    expect(within(login).getByLabelText('이메일')).toHaveValue('new@hapbang.kr')
  })

  it('이미 가입된 이메일(구글 포함)이면 이메일 칸에 BE 문구를 보여 준다', async () => {
    server.use(
      http.post('*/api/v1/members/signup', () =>
        problem(409, 'DUPLICATE_EMAIL', '이미 가입된 이메일입니다.'),
      ),
    )
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '이메일로 가입하기' }),
    )
    const form = within(dialog).getByRole('form', { name: '이메일로 가입' })
    await userEvent.type(within(form).getByLabelText('이메일'), 'g@hapbang.kr')
    await userEvent.type(within(form).getByLabelText('비밀번호'), 'abcd1234')
    await userEvent.type(
      within(form).getByLabelText('비밀번호 확인'),
      'abcd1234',
    )
    await userEvent.type(within(form).getByLabelText('닉네임'), '구름')
    await userEvent.click(
      within(form).getByRole('button', { name: '가입하기' }),
    )

    const email = within(form).getByLabelText('이메일')
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'))
    expect(
      within(form).getByText('이미 가입된 이메일입니다.'),
    ).toBeInTheDocument()
    expect(email).toHaveFocus()
  })
})

describe('비밀번호 변경', () => {
  async function fillAndSubmit(current: string, next: string) {
    const form = await screen.findByRole('form', { name: '비밀번호 변경' })
    await userEvent.type(within(form).getByLabelText('현재 비밀번호'), current)
    await userEvent.type(within(form).getByLabelText('새 비밀번호'), next)
    await userEvent.type(within(form).getByLabelText('새 비밀번호 확인'), next)
    await userEvent.click(
      within(form).getByRole('button', { name: '비밀번호 바꾸기' }),
    )
    return form
  }

  it('바꾸면 새 쿠키로 토큰을 다시 받고 입력을 비운다', async () => {
    const order: string[] = []
    let body: unknown
    renderApp('/settings', 'USER')
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        order.push('refresh')
        return rs({ accessToken: `t${order.length}`, expiresIn: 900 })
      }),
      http.patch('*/api/v1/members/me/password', async ({ request }) => {
        order.push('change')
        body = await request.json()
        return rs(null)
      }),
    )
    const form = await fillAndSubmit('abcd1234', 'efgh5678')

    await waitFor(() =>
      expect(toasts().map((el) => el.textContent)).toContain(
        '비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해 주세요.',
      ),
    )
    expect(body).toEqual({
      currentPassword: 'abcd1234',
      newPassword: 'efgh5678',
    })
    expect(order).toEqual(['refresh', 'change', 'refresh'])
    expect(within(form).getByLabelText('현재 비밀번호')).toHaveValue('')
  })

  it('구글로 가입한 회원이면(PASSWORD_NOT_SET) 비밀번호가 없다고 안내한다', async () => {
    renderApp('/settings', 'USER')
    server.use(
      http.patch('*/api/v1/members/me/password', () =>
        problem(
          409,
          'PASSWORD_NOT_SET',
          '비밀번호로 가입한 회원만 비밀번호를 바꿀 수 있습니다.',
        ),
      ),
    )
    const form = await fillAndSubmit('anything1', 'efgh5678')
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      '구글로 가입한 계정은 비밀번호가 없어요. 구글로 로그인해 주세요.',
    )
  })

  it('현재 비밀번호가 틀리면 그 칸에 BE 문구를 보여 준다', async () => {
    renderApp('/settings', 'USER')
    server.use(
      http.patch('*/api/v1/members/me/password', () =>
        problem(
          400,
          'INVALID_CURRENT_PASSWORD',
          '현재 비밀번호가 올바르지 않습니다.',
        ),
      ),
    )
    const form = await fillAndSubmit('wrong123', 'efgh5678')
    const current = within(form).getByLabelText('현재 비밀번호')
    await waitFor(() => expect(current).toHaveAttribute('aria-invalid', 'true'))
    expect(
      within(form).getByText('현재 비밀번호가 올바르지 않습니다.'),
    ).toBeInTheDocument()
  })
})
