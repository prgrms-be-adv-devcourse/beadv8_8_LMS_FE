import { useState, type FormEvent } from 'react'
import { usePasswordLogin } from '@/shared/auth/session'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'

const FIELD_ID = { email: 'login-email', password: 'login-password' } as const
const FIELD_ORDER = ['email', 'password'] as const

/**
 * 이메일·비밀번호 로그인 폼. 실패하면(비밀번호 틀림·잠금·이용 불가) BE 문구를 폼 안에 보여 준다.
 * 구글로 가입한 이메일도 비밀번호가 없어 '이메일 또는 비밀번호가 올바르지 않습니다'가 된다(BE가 구분하지 않는다).
 */
export function EmailLoginForm({
  initialEmail = '',
  onSignup,
}: {
  /** 가입한 뒤 돌아왔을 때 미리 채울 이메일 */
  initialEmail?: string
  onSignup: () => void
}) {
  const [values, setValues] = useState({ email: initialEmail, password: '' })
  const [failure, setFailure] = useState<string | null>(null)
  const login = usePasswordLogin()
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: {
      email: values.email.trim() ? undefined : '이메일을 입력해 주세요.',
      password: values.password ? undefined : '비밀번호를 입력해 주세요.',
    },
  })

  const set = (key: keyof typeof values) => (value: string) => {
    fields.changed(key)
    setFailure(null)
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit() || login.isPending) return
    login.mutate(
      { email: values.email.trim(), password: values.password },
      {
        onError: (error) => {
          if (!fields.applyServerErrors(error)) setFailure(error.message)
        },
      },
    )
  }

  return (
    <form
      className="form"
      aria-label="이메일로 로그인"
      noValidate
      onSubmit={submit}
      {...fields.formProps}
    >
      <Field id={FIELD_ID.email} label="이메일" error={fields.error('email')}>
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={values.email}
          {...fields.inputProps('email')}
          onChange={(e) => set('email')(e.target.value)}
        />
      </Field>
      <Field
        id={FIELD_ID.password}
        label="비밀번호"
        error={fields.error('password')}
      >
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={values.password}
          {...fields.inputProps('password')}
          onChange={(e) => set('password')(e.target.value)}
        />
      </Field>
      {failure && (
        <p className="notice bad" role="alert">
          {failure}
        </p>
      )}
      <button
        type="submit"
        className="btn primary block"
        disabled={login.isPending}
        {...fields.submitProps}
      >
        이메일로 로그인
      </button>
      <button type="button" className="btn ghost sm" onClick={onSignup}>
        이메일로 가입하기
      </button>
    </form>
  )
}
