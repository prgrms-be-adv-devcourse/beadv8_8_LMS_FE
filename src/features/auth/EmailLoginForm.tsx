import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '@/shared/api/ApiError'
import { usePasswordLogin } from '@/shared/auth/session'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'

const FIELD_ID = { email: 'login-email', password: 'login-password' } as const
const FIELD_ORDER = ['email', 'password'] as const

/** 복구할 수 있는 탈퇴 회원의 로그인. 복구한 뒤 같은 값으로 다시 로그인한다 */
export type RestorableLogin = {
  email: string
  password: string
  restorableUntil: string | null
}

/**
 * 이메일·비밀번호 로그인 폼. 실패하면(비밀번호 틀림·잠금·이용 불가) BE 문구를 폼 안에 보여 준다.
 * 구글로 가입한 이메일도 비밀번호가 없어 '이메일 또는 비밀번호가 올바르지 않습니다'가 된다(BE가 구분하지 않는다).
 * 복구할 수 있는 탈퇴 회원이면(409 WITHDRAWN_RESTORABLE) onRestorable로 넘겨 복구할지 묻게 한다.
 */
export function EmailLoginForm({
  initialEmail = '',
  autoFocus = false,
  onSignup,
  onForgotPassword,
  onRestorable,
}: {
  /** 가입·비밀번호 재설정 뒤 돌아왔을 때 미리 채울 이메일 */
  initialEmail?: string
  /** 가입 화면에서 돌아왔으면 첫 칸으로 포커스한다(누른 버튼이 사라져 포커스가 모달 밖으로 나가지 않게) */
  autoFocus?: boolean
  onSignup: () => void
  /** 비밀번호 재설정으로 간다. 적던 이메일을 넘긴다 */
  onForgotPassword: (email: string) => void
  onRestorable: (login: RestorableLogin) => void
}) {
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) firstRef.current?.focus()
  }, [autoFocus])
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
    const body = { email: values.email.trim(), password: values.password }
    login.mutate(body, {
      onError: (error) => {
        if (isApiError(error, 'WITHDRAWN_RESTORABLE'))
          return onRestorable({
            ...body,
            restorableUntil: error.body?.restorableUntil ?? null,
          })
        if (!fields.applyServerErrors(error)) setFailure(error.message)
      },
    })
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
          ref={firstRef}
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
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => onForgotPassword(values.email.trim())}
      >
        비밀번호를 잊으셨나요?
      </button>
    </form>
  )
}
