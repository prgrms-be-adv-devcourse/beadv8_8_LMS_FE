import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NICKNAME_TAKEN, nicknameError } from '@/entities/member/nickname'
import { useNicknameAvailability } from '@/entities/member/useNicknameAvailability'
import { passwordError } from '@/entities/member/password'
import { isApiError } from '@/shared/api/ApiError'
import { signup } from '@/shared/auth/me'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import {
  EmailVerification,
  type RestartVerification,
  type VerifiedEmail,
} from './EmailVerification'

const FIELD_ID = {
  password: 'signup-password',
  passwordConfirm: 'signup-password-confirm',
  nickname: 'signup-nickname',
} as const
type FieldKey = keyof typeof FIELD_ID
const FIELD_ORDER = ['password', 'passwordConfirm', 'nickname'] as const

/** BE 오류 코드가 가리키는 칸 */
const CODE_FIELD: Record<string, FieldKey> = {
  INVALID_PASSWORD_LENGTH: 'password',
  INVALID_PASSWORD_CHARACTER: 'password',
  PASSWORD_LETTER_AND_DIGIT_REQUIRED: 'password',
  INVALID_NICKNAME_LENGTH: 'nickname',
  INVALID_NICKNAME_CHARACTER: 'nickname',
  INVALID_NICKNAME_SPACE: 'nickname',
  DUPLICATE_NICKNAME: 'nickname',
}

/**
 * 이메일·비밀번호 가입: 메일 인증 코드로 이메일을 확인한 뒤(SIGN_UP) 비밀번호·닉네임을 받아 그 토큰으로 가입한다.
 * 가입만 하고 로그인은 하지 않으므로(BE) 성공하면 로그인으로 돌려보낸다.
 * 이메일 하나는 구글이나 비밀번호 중 한 방식으로만 가입한다.
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
  return (
    <EmailVerification
      purpose="SIGN_UP"
      label="이메일로 가입"
      autoFocus={autoFocus}
      intro={
        <p className="fine">
          구글로 가입한 이메일은 쓸 수 없어요. 가입한 방식으로만 로그인할 수
          있어요.
        </p>
      }
      onBack={onBack}
    >
      {(verified, restart) => (
        <SignupDetailsForm
          verified={verified}
          restart={restart}
          onDone={onDone}
          onBack={onBack}
        />
      )}
    </EmailVerification>
  )
}

/** 인증한 이메일로 비밀번호·닉네임을 받아 가입한다. 가입이 실패해도 토큰은 남아 칸만 고쳐 다시 보낸다 */
function SignupDetailsForm({
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
    password: '',
    passwordConfirm: '',
    nickname: '',
  })
  const [failure, setFailure] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    firstRef.current?.focus()
  }, [])
  const availability = useNicknameAvailability(values.nickname)
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: {
      password: passwordError(values.password) ?? undefined,
      passwordConfirm: !values.passwordConfirm
        ? '비밀번호를 한 번 더 입력해 주세요.'
        : values.passwordConfirm !== values.password
          ? '비밀번호가 서로 달라요.'
          : undefined,
      nickname:
        nicknameError(values.nickname) ??
        (availability.taken ? NICKNAME_TAKEN : undefined),
    },
  })
  const save = useMutation({
    mutationFn: signup,
    onSuccess: (_, { email }) => onDone(email),
    onError: (error) => {
      // 토큰이 만료·사용됐으면 코드부터 다시 받는다.
      if (isApiError(error, 'EMAIL_NOT_VERIFIED')) return restart()
      // 토큰을 받은 뒤 다른 경로(구글 등)로 먼저 가입됐다. 다른 이메일은 새로 인증해야 한다.
      if (isApiError(error, 'DUPLICATE_EMAIL')) return restart(error.message)
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
      password: values.password,
      nickname: values.nickname.trim(),
      emailVerificationToken: verified.token,
    })
  }

  const nicknameProps = fields.inputProps('nickname')

  return (
    <form
      className="form"
      aria-label="이메일로 가입"
      noValidate
      onSubmit={submit}
      {...fields.formProps}
    >
      <Field id="signup-email" label="이메일" hint="인증한 이메일이에요.">
        <input
          id="signup-email"
          className="input"
          type="email"
          autoComplete="username"
          value={verified.email}
          readOnly
        />
      </Field>
      <Field
        id={FIELD_ID.password}
        label="비밀번호"
        error={fields.error('password')}
        hint="8~64자, 영문과 숫자를 하나 이상씩. 공백·한글은 쓸 수 없어요."
      >
        <input
          ref={firstRef}
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
          {...nicknameProps}
          onBlur={() => {
            nicknameProps.onBlur()
            availability.check()
          }}
          onChange={(e) => set('nickname')(e.target.value)}
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
