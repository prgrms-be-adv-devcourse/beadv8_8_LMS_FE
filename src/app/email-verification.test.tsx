import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Me } from '@/shared/auth/me'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { EMAIL_TOKEN, mockEmailCodes, problem } from '@/test/emailCodeMock'
import { expectFieldError } from '@/test/fieldError'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const me = (patch: Partial<Me> = {}): Me => ({
  id: ME_ID,
  email: 'new@hapbang.kr',
  nickname: '새벽',
  role: 'USER',
  status: 'ACTIVE',
  profileImageUrl: null,
  ...patch,
})

const SENT_NOTICE =
  '메일을 확인해 주세요. 메일이 오지 않으면 1분 뒤 다시 받거나 이메일 주소를 확인해 주세요.'

/** 헤더의 로그인 버튼으로 모달을 연다 */
async function openLogin() {
  await userEvent.click(
    await within(await screen.findByRole('banner')).findByRole('button', {
      name: '로그인',
    }),
  )
  return screen.findByRole('dialog', { name: '합방 시작하기' })
}

/** 로그인 모달에서 이메일 가입 화면을 연다 */
async function openSignup() {
  renderApp('/lectures', 'GUEST')
  const dialog = await openLogin()
  await userEvent.click(
    within(dialog).getByRole('button', { name: '이메일로 가입하기' }),
  )
  return dialog
}

/** 이메일 단계에서 코드를 받는다(email이 비었으면 채워 둔 이메일로). 코드 확인 폼을 돌려준다 */
async function requestCode(dialog: HTMLElement, form: string, email: string) {
  const emailForm = within(dialog).getByRole('form', { name: form })
  if (email)
    await userEvent.type(within(emailForm).getByLabelText('이메일'), email)
  await userEvent.click(
    within(emailForm).getByRole('button', { name: '인증 코드 받기' }),
  )
  return within(dialog).findByRole('form', { name: '인증 코드 확인' })
}

/** 코드를 받아 정답 코드로 확인한다. 이어지는 단계(가입·새 비밀번호) 폼을 돌려준다 */
async function verifyAndOpenDetails(
  dialog: HTMLElement,
  email: string,
  { form = '이메일로 가입', next = '이메일로 가입' } = {},
) {
  const codeForm = await requestCode(dialog, form, email)
  await userEvent.type(within(codeForm).getByLabelText('인증 코드'), '123456')
  await userEvent.click(within(codeForm).getByRole('button', { name: '확인' }))
  return within(dialog).findByRole('form', { name: next })
}

/** 가입 단계 칸을 채워 가입한다. 닉네임 칸을 돌려준다 */
async function fillDetails(form: HTMLElement, nickname: string) {
  await userEvent.type(within(form).getByLabelText('비밀번호'), 'abcd1234')
  await userEvent.type(within(form).getByLabelText('비밀번호 확인'), 'abcd1234')
  const input = within(form).getByLabelText('닉네임')
  await userEvent.type(input, nickname)
  await userEvent.click(within(form).getByRole('button', { name: '가입하기' }))
  return input
}

afterEach(() => {
  vi.useRealTimers()
  queryClient.clear()
  closeLoginModal()
})

describe('이메일 가입', () => {
  it('이메일로 코드를 받고 6자리를 확인하면 받은 토큰을 넣어 가입하고, 로그인으로 돌아와 이메일을 채워 둔다', async () => {
    const codes = mockEmailCodes()
    let body: unknown
    server.use(
      http.post('*/api/v1/members/signup', async ({ request }) => {
        body = await request.json()
        return rs(me(), 201)
      }),
    )
    const dialog = await openSignup()

    const codeForm = await requestCode(
      dialog,
      '이메일로 가입',
      ' new@hapbang.kr ',
    )
    expect(codes.sent).toEqual([
      { email: 'new@hapbang.kr', purpose: 'SIGN_UP' },
    ])
    expect(within(codeForm).getByRole('status')).toHaveTextContent(SENT_NOTICE)
    const code = within(codeForm).getByLabelText('인증 코드')
    expect(code).toHaveFocus()
    expect(
      within(codeForm).getByText(
        'new@hapbang.kr에 보낸 숫자 6자리예요. 10분 동안 쓸 수 있어요.',
      ),
    ).toBeInTheDocument()
    await userEvent.type(code, '123456')
    await userEvent.click(
      within(codeForm).getByRole('button', { name: '확인' }),
    )

    const form = await within(dialog).findByRole('form', {
      name: '이메일로 가입',
    })
    expect(codes.verified).toEqual([
      { email: 'new@hapbang.kr', purpose: 'SIGN_UP', code: '123456' },
    ])
    const email = within(form).getByLabelText('이메일')
    expect(email).toHaveValue('new@hapbang.kr')
    expect(email).toHaveAttribute('readonly')
    const password = within(form).getByLabelText('비밀번호')
    expect(password).toHaveFocus()

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
      emailVerificationToken: EMAIL_TOKEN,
    })
    const login = within(dialog).getByRole('form', { name: '이메일로 로그인' })
    expect(within(login).getByLabelText('이메일')).toHaveValue('new@hapbang.kr')
  })

  it('다시 받기는 60초 동안 남은 초와 함께 막고, 다시 받으면 같은 안내와 함께 입력한 코드를 비운다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const codes = mockEmailCodes()
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    await user.click(
      within(dialog).getByRole('button', { name: '이메일로 가입하기' }),
    )
    const emailForm = within(dialog).getByRole('form', {
      name: '이메일로 가입',
    })
    await user.type(within(emailForm).getByLabelText('이메일'), 'a@hapbang.kr')
    await user.click(
      within(emailForm).getByRole('button', { name: '인증 코드 받기' }),
    )
    const codeForm = await within(dialog).findByRole('form', {
      name: '인증 코드 확인',
    })
    const code = within(codeForm).getByLabelText('인증 코드')
    await user.type(code, '111')
    expect(
      within(codeForm).getByRole('button', { name: '코드 다시 받기 (60초)' }),
    ).toBeDisabled()

    await act(() => vi.advanceTimersByTimeAsync(59_000))
    expect(
      within(codeForm).getByRole('button', { name: '코드 다시 받기 (1초)' }),
    ).toBeDisabled()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    const resend = within(codeForm).getByRole('button', {
      name: '코드 다시 받기',
    })
    expect(resend).toBeEnabled()

    await user.click(resend)
    await waitFor(() => expect(codes.sent).toHaveLength(2))
    expect(codes.sent[1]).toEqual({ email: 'a@hapbang.kr', purpose: 'SIGN_UP' })
    expect(
      await within(codeForm).findByRole('button', {
        name: '코드 다시 받기 (60초)',
      }),
    ).toBeDisabled()
    expect(code).toHaveValue('')
    expect(code).toHaveFocus()
    expect(within(codeForm).getByRole('status')).toHaveTextContent(SENT_NOTICE)
  })

  it('코드는 숫자만 6자리까지 받고, 6자리가 아니면 확인하지 않는다', async () => {
    const codes = mockEmailCodes()
    const dialog = await openSignup()
    const codeForm = await requestCode(dialog, '이메일로 가입', 'a@hapbang.kr')
    const code = within(codeForm).getByLabelText('인증 코드')

    await userEvent.type(code, '12-3 4a')
    expect(code).toHaveValue('1234')
    await userEvent.click(
      within(codeForm).getByRole('button', { name: '확인' }),
    )
    expectFieldError(code, '인증 코드는 숫자 6자리예요.')
    expect(code).toHaveFocus()
    expect(codes.verified).toEqual([])

    await userEvent.type(code, '567890')
    expect(code).toHaveValue('123456')
  })

  it.each([
    ['INVALID_EMAIL_CODE', '인증 코드가 맞지 않아요.'],
    ['EMAIL_CODE_EXPIRED', '인증 코드가 만료됐어요. 코드를 다시 받아 주세요.'],
  ])('코드 확인이 %s면 코드 칸에 BE 문구를 보여 준다', async (code, detail) => {
    mockEmailCodes()
    server.use(
      http.post('*/api/v1/members/email-codes/verify', () =>
        problem(400, code, detail),
      ),
    )
    const dialog = await openSignup()
    const codeForm = await requestCode(dialog, '이메일로 가입', 'a@hapbang.kr')
    const input = within(codeForm).getByLabelText('인증 코드')
    await userEvent.type(input, '123456')
    await userEvent.click(
      within(codeForm).getByRole('button', { name: '확인' }),
    )

    await waitFor(() => expectFieldError(input, detail))
    expect(input).toHaveFocus()
  })

  it.each([
    [
      429,
      'EMAIL_CODE_RESEND_TOO_SOON',
      '인증 코드는 1분에 한 번 받을 수 있어요. 잠시 뒤 다시 시도해 주세요.',
    ],
    [
      429,
      'EMAIL_CODE_TOO_MANY_REQUESTS',
      '인증 코드 요청이 너무 많아요. 1시간 뒤에 다시 시도해 주세요.',
    ],
    [
      429,
      'EMAIL_CODE_DAILY_LIMIT',
      '이 이메일로는 오늘 인증 메일을 더 받을 수 없어요. 내일 다시 시도해 주세요.',
    ],
    [
      503,
      'EMAIL_SEND_UNAVAILABLE',
      '지금은 인증 메일을 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    ],
  ])(
    '코드 받기가 %d %s면 BE 문구를 알리고 이메일 단계에 머문다',
    async (status, code, detail) => {
      server.use(
        http.post('*/api/v1/members/email-codes', () =>
          problem(status, code, detail),
        ),
      )
      const dialog = await openSignup()
      const form = within(dialog).getByRole('form', { name: '이메일로 가입' })
      await userEvent.type(within(form).getByLabelText('이메일'), 'a@b.kr')
      await userEvent.click(
        within(form).getByRole('button', { name: '인증 코드 받기' }),
      )

      expect(await within(form).findByRole('alert')).toHaveTextContent(detail)
      expect(
        within(dialog).queryByRole('form', { name: '인증 코드 확인' }),
      ).toBeNull()
    },
  )

  it('닉네임이 겹치면(409 DUPLICATE_NICKNAME) 닉네임 칸에 보여 주고, 고치면 같은 토큰으로 다시 가입한다', async () => {
    const codes = mockEmailCodes()
    const bodies: unknown[] = []
    server.use(
      http.post('*/api/v1/members/signup', async ({ request }) => {
        const body = (await request.json()) as { nickname: string }
        bodies.push(body)
        return body.nickname === '새벽'
          ? problem(409, 'DUPLICATE_NICKNAME', '이미 쓰고 있는 닉네임이에요.')
          : rs(me({ nickname: body.nickname }), 201)
      }),
    )
    const dialog = await openSignup()
    const form = await verifyAndOpenDetails(dialog, 'new@hapbang.kr')
    const nickname = await fillDetails(form, '새벽')

    await waitFor(() =>
      expectFieldError(nickname, '이미 쓰고 있는 닉네임이에요.'),
    )
    expect(nickname).toHaveFocus()

    await userEvent.clear(nickname)
    await userEvent.type(nickname, '새벽별')
    await userEvent.click(
      within(form).getByRole('button', { name: '가입하기' }),
    )
    expect(
      await within(dialog).findByText(
        '가입했어요. 이메일과 비밀번호로 로그인해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(bodies).toEqual([
      expect.objectContaining({
        nickname: '새벽',
        emailVerificationToken: EMAIL_TOKEN,
      }),
      expect.objectContaining({
        nickname: '새벽별',
        emailVerificationToken: EMAIL_TOKEN,
      }),
    ])
    expect(codes.sent).toHaveLength(1)
    expect(codes.verified).toHaveLength(1)
  })

  it('가입이 EMAIL_NOT_VERIFIED면 이메일 단계로 돌아가 이메일을 남기고 코드를 다시 받으라고 알린다', async () => {
    mockEmailCodes()
    server.use(
      http.post('*/api/v1/members/signup', () =>
        problem(400, 'EMAIL_NOT_VERIFIED', '이메일 인증을 먼저 해 주세요.'),
      ),
    )
    const dialog = await openSignup()
    await fillDetails(
      await verifyAndOpenDetails(dialog, 'new@hapbang.kr'),
      '새벽',
    )

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(
      '이메일 인증이 만료됐어요. 인증 코드를 다시 받아 주세요.',
    )
    const form = within(dialog).getByRole('form', { name: '이메일로 가입' })
    expect(form).toContainElement(alert)
    const email = within(form).getByLabelText('이메일')
    expect(email).toHaveValue('new@hapbang.kr')
    expect(email).not.toHaveAttribute('readonly')
    expect(email).toHaveFocus()
    expect(
      within(form).getByRole('button', { name: '인증 코드 받기' }),
    ).toBeInTheDocument()
  })

  it('토큰을 받은 뒤 이미 가입된 이메일(409 DUPLICATE_EMAIL)이면 이메일 단계의 이메일 칸에 BE 문구를 보여 준다', async () => {
    mockEmailCodes()
    server.use(
      http.post('*/api/v1/members/signup', () =>
        problem(409, 'DUPLICATE_EMAIL', '이미 가입된 이메일입니다.'),
      ),
    )
    const dialog = await openSignup()
    await fillDetails(
      await verifyAndOpenDetails(dialog, 'g@hapbang.kr'),
      '구름',
    )

    const form = await within(dialog).findByRole('form', {
      name: '이메일로 가입',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('button', { name: '인증 코드 받기' }),
      ).toBeInTheDocument(),
    )
    const email = within(form).getByLabelText('이메일')
    await waitFor(() => expectFieldError(email, '이미 가입된 이메일입니다.'))
    expect(email).toHaveValue('g@hapbang.kr')
    expect(email).toHaveFocus()
  })

  it('이메일 바꾸기를 누르면 이메일 단계로 돌아가 입력한 이메일을 남긴다', async () => {
    mockEmailCodes()
    const dialog = await openSignup()
    const codeForm = await requestCode(dialog, '이메일로 가입', 'a@hapbang.kr')
    await userEvent.click(
      within(codeForm).getByRole('button', { name: '이메일 바꾸기' }),
    )

    const form = within(dialog).getByRole('form', { name: '이메일로 가입' })
    const email = within(form).getByLabelText('이메일')
    expect(email).toHaveValue('a@hapbang.kr')
    expect(email).toHaveFocus()
  })
})

describe('비밀번호 재설정', () => {
  /** 로그인 폼에 이메일을 적고 비밀번호 재설정으로 들어간다 */
  async function openReset(email = 'user@hapbang.kr') {
    renderApp('/lectures', 'GUEST')
    const dialog = await openLogin()
    const login = within(dialog).getByRole('form', { name: '이메일로 로그인' })
    await userEvent.type(within(login).getByLabelText('이메일'), email)
    await userEvent.click(
      within(login).getByRole('button', { name: '비밀번호를 잊으셨나요?' }),
    )
    return dialog
  }

  /** 새 비밀번호를 두 번 넣고 보낸다. 새 비밀번호 칸을 돌려준다 */
  async function submitNewPassword(form: HTMLElement, password: string) {
    const input = within(form).getByLabelText('새 비밀번호')
    await userEvent.type(input, password)
    await userEvent.type(
      within(form).getByLabelText('새 비밀번호 확인'),
      password,
    )
    await userEvent.click(
      within(form).getByRole('button', { name: '비밀번호 다시 설정' }),
    )
    return input
  }

  const RESET = { form: '비밀번호 재설정', next: '새 비밀번호 설정' }

  it('비밀번호를 잊으셨나요?로 들어가 이메일 → 코드 → 새 비밀번호로 재설정하면, 로그인으로 돌아와 이메일을 채우고 다시 로그인하라고 안내한다', async () => {
    const codes = mockEmailCodes()
    let body: unknown
    server.use(
      http.post('*/api/v1/members/password-reset', async ({ request }) => {
        body = await request.json()
        return rs(null)
      }),
    )
    const dialog = await openReset(' user@hapbang.kr ')

    const form = within(dialog).getByRole('form', { name: '비밀번호 재설정' })
    const email = within(form).getByLabelText('이메일')
    expect(email).toHaveValue('user@hapbang.kr')
    expect(email).toHaveFocus()
    await userEvent.click(
      within(form).getByRole('button', { name: '인증 코드 받기' }),
    )
    const codeForm = await within(dialog).findByRole('form', {
      name: '인증 코드 확인',
    })
    expect(codes.sent).toEqual([
      { email: 'user@hapbang.kr', purpose: 'PASSWORD_RESET' },
    ])
    await userEvent.type(within(codeForm).getByLabelText('인증 코드'), '123456')
    await userEvent.click(
      within(codeForm).getByRole('button', { name: '확인' }),
    )

    const next = await within(dialog).findByRole('form', {
      name: '새 비밀번호 설정',
    })
    expect(codes.verified).toEqual([
      { email: 'user@hapbang.kr', purpose: 'PASSWORD_RESET', code: '123456' },
    ])
    expect(within(next).getByLabelText('이메일')).toHaveValue('user@hapbang.kr')
    expect(within(next).getByLabelText('새 비밀번호')).toHaveFocus()
    await submitNewPassword(next, 'efgh5678')

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      '비밀번호를 다시 설정했어요. 새 비밀번호로 로그인해 주세요.',
    )
    expect(body).toEqual({
      email: 'user@hapbang.kr',
      emailVerificationToken: EMAIL_TOKEN,
      newPassword: 'efgh5678',
    })
    const login = within(dialog).getByRole('form', { name: '이메일로 로그인' })
    expect(within(login).getByLabelText('이메일')).toHaveValue(
      'user@hapbang.kr',
    )
  })

  it('BE가 새 비밀번호 규칙 오류(400)를 주면 그 칸에 보여 주고, 고치면 같은 토큰으로 다시 보낸다', async () => {
    mockEmailCodes()
    const bodies: { newPassword: string; emailVerificationToken: string }[] = []
    server.use(
      http.post('*/api/v1/members/password-reset', async ({ request }) => {
        const body = (await request.json()) as (typeof bodies)[number]
        bodies.push(body)
        return bodies.length === 1
          ? problem(
              400,
              'INVALID_PASSWORD_LENGTH',
              '비밀번호는 8~64자로 입력해 주세요.',
            )
          : rs(null)
      }),
    )
    const dialog = await openReset()
    const form = await verifyAndOpenDetails(dialog, '', RESET)
    const input = await submitNewPassword(form, 'efgh5678')

    await waitFor(() =>
      expectFieldError(input, '비밀번호는 8~64자로 입력해 주세요.'),
    )
    expect(input).toHaveFocus()
    await userEvent.type(input, '9')
    const confirm = within(form).getByLabelText('새 비밀번호 확인')
    await userEvent.type(confirm, '9')
    await userEvent.click(
      within(form).getByRole('button', { name: '비밀번호 다시 설정' }),
    )

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      '비밀번호를 다시 설정했어요. 새 비밀번호로 로그인해 주세요.',
    )
    expect(bodies.map((b) => b.emailVerificationToken)).toEqual([
      EMAIL_TOKEN,
      EMAIL_TOKEN,
    ])
    expect(bodies[1].newPassword).toBe('efgh56789')
  })

  it('재설정이 EMAIL_NOT_VERIFIED면 이메일 단계로 돌아가 이메일을 남기고 코드를 다시 받으라고 알린다', async () => {
    mockEmailCodes()
    server.use(
      http.post('*/api/v1/members/password-reset', () =>
        problem(400, 'EMAIL_NOT_VERIFIED', '이메일 인증을 먼저 해 주세요.'),
      ),
    )
    const dialog = await openReset()
    await submitNewPassword(
      await verifyAndOpenDetails(dialog, '', RESET),
      'efgh5678',
    )

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(
      '이메일 인증이 만료됐어요. 인증 코드를 다시 받아 주세요.',
    )
    const form = within(dialog).getByRole('form', { name: '비밀번호 재설정' })
    expect(form).toContainElement(alert)
    expect(within(form).getByLabelText('이메일')).toHaveValue('user@hapbang.kr')
  })

  it('구글로만 가입한 회원이면(409 PASSWORD_NOT_SET) 구글로 로그인하라고 안내한다', async () => {
    mockEmailCodes()
    server.use(
      http.post('*/api/v1/members/password-reset', () =>
        problem(
          409,
          'PASSWORD_NOT_SET',
          '비밀번호로 가입한 회원만 비밀번호를 바꿀 수 있습니다.',
        ),
      ),
    )
    const dialog = await openReset()
    const form = await verifyAndOpenDetails(dialog, '', RESET)
    await submitNewPassword(form, 'efgh5678')

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      '구글로 가입한 계정은 비밀번호가 없어요. 구글로 로그인해 주세요.',
    )
  })
})
