import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { nicknameError } from '@/entities/member/nickname'
import { emailError, passwordError } from '@/entities/member/password'
import { isApiError } from '@/shared/api/ApiError'
import { signup } from '@/shared/auth/me'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'

const FIELD_ID = {
  email: 'signup-email',
  password: 'signup-password',
  passwordConfirm: 'signup-password-confirm',
  nickname: 'signup-nickname',
} as const
type FieldKey = keyof typeof FIELD_ID
const FIELD_ORDER = [
  'email',
  'password',
  'passwordConfirm',
  'nickname',
] as const

/** BE 오류 코드가 가리키는 칸 */
const CODE_FIELD: Record<string, FieldKey> = {
  DUPLICATE_EMAIL: 'email',
  INVALID_PASSWORD_LENGTH: 'password',
  INVALID_PASSWORD_CHARACTER: 'password',
  PASSWORD_LETTER_AND_DIGIT_REQUIRED: 'password',
  INVALID_NICKNAME_LENGTH: 'nickname',
  INVALID_NICKNAME_CHARACTER: 'nickname',
  INVALID_NICKNAME_SPACE: 'nickname',
}

/**
 * 이메일·비밀번호 가입. 가입만 하고 로그인은 하지 않으므로(BE) 성공하면 로그인으로 돌려보낸다.
 * 이메일 하나는 구글이나 비밀번호 중 한 방식으로만 가입한다(구글로 가입한 이메일이면 409 DUPLICATE_EMAIL).
 */
export function SignupForm({
  autoFocus = false,
  onDone,
  onBack,
}: {
  /** 로그인 화면에서 넘어왔으면 첫 칸으로 포커스한다(누른 버튼이 사라져 포커스가 모달 밖으로 나가지 않게) */
  autoFocus?: boolean
  /** 가입한 이메일로 로그인 화면을 연다 */
  onDone: (email: string) => void
  onBack: () => void
}) {
  const [values, setValues] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    nickname: '',
  })
  const [failure, setFailure] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) firstRef.current?.focus()
  }, [autoFocus])
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: {
      email: emailError(values.email) ?? undefined,
      password: passwordError(values.password) ?? undefined,
      passwordConfirm: !values.passwordConfirm
        ? '비밀번호를 한 번 더 입력해 주세요.'
        : values.passwordConfirm !== values.password
          ? '비밀번호가 서로 달라요.'
          : undefined,
      nickname: nicknameError(values.nickname) ?? undefined,
    },
  })
  const save = useMutation({
    mutationFn: signup,
    onSuccess: (_, { email }) => onDone(email),
    onError: (error) => {
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
      email: values.email.trim(),
      password: values.password,
      nickname: values.nickname.trim(),
    })
  }

  return (
    <form
      className="form"
      aria-label="이메일로 가입"
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
        hint="8~64자, 영문과 숫자를 하나 이상씩. 공백·한글은 쓸 수 없어요."
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={values.password}
          {...fields.inputProps('password')}
          onChange={(e) => set('password')(e.target.value)}
        />
      </Field>
      <Field
        id={FIELD_ID.passwordConfirm}
        label="비밀번호 확인"
        error={fields.error('passwordConfirm')}
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={values.passwordConfirm}
          {...fields.inputProps('passwordConfirm')}
          onChange={(e) => set('passwordConfirm')(e.target.value)}
        />
      </Field>
      <Field
        id={FIELD_ID.nickname}
        label="닉네임"
        error={fields.error('nickname')}
        hint="2~12자, 한글·영문·숫자·공백·밑줄"
      >
        <input
          className="input"
          autoComplete="nickname"
          value={values.nickname}
          maxLength={20}
          {...fields.inputProps('nickname')}
          onChange={(e) => set('nickname')(e.target.value)}
        />
      </Field>
      <p className="fine">
        구글로 가입한 이메일은 쓸 수 없어요. 가입한 방식으로만 로그인할 수
        있어요.
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
        가입하기
      </button>
      <button type="button" className="btn ghost sm" onClick={onBack}>
        로그인으로 돌아가기
      </button>
    </form>
  )
}
