import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { passwordError } from '@/entities/member/password'
import { isApiError } from '@/shared/api/ApiError'
import { resetPassword } from '@/shared/auth/me'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import {
  EmailVerification,
  type RestartVerification,
  type VerifiedEmail,
} from './EmailVerification'

const FIELD_ID = {
  newPassword: 'reset-new-password',
  newPasswordConfirm: 'reset-new-password-confirm',
} as const
type FieldKey = keyof typeof FIELD_ID
const FIELD_ORDER = ['newPassword', 'newPasswordConfirm'] as const

/** BE 오류 코드가 가리키는 칸. 이때는 토큰이 남아 칸만 고쳐 다시 보낸다 */
const CODE_FIELD: Record<string, FieldKey> = {
  INVALID_PASSWORD_LENGTH: 'newPassword',
  INVALID_PASSWORD_CHARACTER: 'newPassword',
  PASSWORD_LETTER_AND_DIGIT_REQUIRED: 'newPassword',
}

/**
 * 비밀번호 재설정(비밀번호를 잊었을 때): 메일 인증 코드로 이메일을 확인한 뒤(PASSWORD_RESET) 새 비밀번호를 받는다.
 * 재설정하면 모든 기기가 로그아웃되므로 로그인 화면으로 돌려보내 새 비밀번호로 로그인하게 한다.
 */
export function PasswordResetForm({
  initialEmail,
  onDone,
  onBack,
}: {
  /** 로그인 폼에 적던 이메일 */
  initialEmail: string
  /** 재설정한 이메일로 로그인 화면을 연다 */
  onDone: (email: string) => void
  onBack: () => void
}) {
  return (
    <EmailVerification
      purpose="PASSWORD_RESET"
      label="비밀번호 재설정"
      // 로그인 폼의 버튼을 눌러 넘어오므로 늘 첫 칸으로 포커스한다.
      autoFocus
      initialEmail={initialEmail}
      intro={
        <p className="fine">
          가입한 이메일로 인증 코드를 보내 드려요. 구글로 가입한 계정은
          비밀번호가 없어요.
        </p>
      }
      onBack={onBack}
    >
      {(verified, restart) => (
        <NewPasswordForm
          verified={verified}
          restart={restart}
          onDone={onDone}
          onBack={onBack}
        />
      )}
    </EmailVerification>
  )
}

/** 인증한 이메일의 새 비밀번호를 받는다. 비밀번호 규칙 오류면 토큰이 남아 칸만 고쳐 다시 보낸다 */
function NewPasswordForm({
  verified,
  restart,
  onDone,
  onBack,
}: {
  verified: VerifiedEmail
  restart: RestartVerification
  onDone: (email: string) => void
  onBack: () => void
}) {
  const [values, setValues] = useState({
    newPassword: '',
    newPasswordConfirm: '',
  })
  const [failure, setFailure] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    firstRef.current?.focus()
  }, [])
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: {
      newPassword: passwordError(values.newPassword) ?? undefined,
      newPasswordConfirm: !values.newPasswordConfirm
        ? '새 비밀번호를 한 번 더 입력해 주세요.'
        : values.newPasswordConfirm !== values.newPassword
          ? '새 비밀번호가 서로 달라요.'
          : undefined,
    },
  })
  const save = useMutation({
    mutationFn: resetPassword,
    onSuccess: (_, { email }) => onDone(email),
    onError: (error) => {
      // 토큰이 만료·사용됐거나 그사이 탈퇴·정지됐으면 코드부터 다시 받는다.
      if (isApiError(error, 'EMAIL_NOT_VERIFIED')) return restart()
      // 재설정 코드는 비밀번호 회원에게만 가므로 정상 흐름에서는 생기지 않는다.
      if (isApiError(error, 'PASSWORD_NOT_SET'))
        return setFailure(
          '구글로 가입한 계정은 비밀번호가 없어요. 구글로 로그인해 주세요.',
        )
      const field =
        isApiError(error) && Object.hasOwn(CODE_FIELD, error.code)
          ? CODE_FIELD[error.code]
          : undefined
      if (field) fields.showServerErrors([{ field, message: error.message }])
      else if (!fields.applyServerErrors(error)) setFailure(error.message)
    },
  })

  const set = (key: FieldKey) => (value: string) => {
    fields.changed(key)
    setFailure(null)
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit() || save.isPending) return
    save.mutate({
      email: verified.email,
      emailVerificationToken: verified.token,
      newPassword: values.newPassword,
    })
  }

  return (
    <form
      className="form"
      aria-label="새 비밀번호 설정"
      noValidate
      onSubmit={submit}
      {...fields.formProps}
    >
      <Field id="reset-email" label="이메일" hint="인증한 이메일이에요.">
        <input
          id="reset-email"
          className="input"
          type="email"
          autoComplete="username"
          value={verified.email}
          readOnly
        />
      </Field>
      <Field
        id={FIELD_ID.newPassword}
        label="새 비밀번호"
        error={fields.error('newPassword')}
        hint="8~64자, 영문과 숫자를 하나 이상씩. 공백·한글은 쓸 수 없어요."
      >
        <input
          ref={firstRef}
          className="input"
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          {...fields.inputProps('newPassword')}
          onChange={(e) => set('newPassword')(e.target.value)}
        />
      </Field>
      <Field
        id={FIELD_ID.newPasswordConfirm}
        label="새 비밀번호 확인"
        error={fields.error('newPasswordConfirm')}
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={values.newPasswordConfirm}
          {...fields.inputProps('newPasswordConfirm')}
          onChange={(e) => set('newPasswordConfirm')(e.target.value)}
        />
      </Field>
      <p className="fine">
        다시 설정하면 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인해
        주세요.
      </p>
      {failure && (
        <p className="notice bad" role="alert">
          {failure}
        </p>
      )}
      <button
        type="submit"
        className="btn primary block"
        disabled={save.isPending}
        {...fields.submitProps}
      >
        비밀번호 다시 설정
      </button>
      <button type="button" className="btn ghost sm" onClick={onBack}>
        로그인으로 돌아가기
      </button>
    </form>
  )
}
