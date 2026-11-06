import { useMutation } from '@tanstack/react-query'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { emailError } from '@/entities/member/password'
import { isApiError } from '@/shared/api/ApiError'
import {
  sendEmailCode,
  verifyEmailCode,
  type EmailCodePurpose,
  type EmailCodeSent,
} from '@/shared/auth/emailCode'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import { useCooldown } from './useCooldown'

const EMAIL_FIELD = { email: 'verify-email' } as const
const CODE_FIELD = { code: 'verify-code' } as const

/** 코드 확인 오류 중 코드 칸을 가리키는 것 */
const CODE_ERRORS = new Set(['INVALID_EMAIL_CODE', 'EMAIL_CODE_EXPIRED'])

/** 인증 토큰이 만료·사용돼 처음부터 다시 할 때의 안내 */
const EXPIRED_MESSAGE =
  '이메일 인증이 만료됐어요. 인증 코드를 다시 받아 주세요.'

/** 인증을 마친 이메일과 그 용도의 인증 토큰(30분, 한 번만 쓴다) */
export type VerifiedEmail = { email: string; token: string }

/**
 * 처음(이메일 단계)으로 돌아가 인증을 다시 한다. 이메일은 남긴다.
 * emailError를 넘기면 이메일 칸에 보이고(가입된 이메일 등), 없으면 인증이 만료됐다고 안내한다(EMAIL_NOT_VERIFIED).
 */
export type RestartVerification = (emailError?: string) => void

type Step =
  | { name: 'email'; email: string; error?: { email?: string; form?: string } }
  | { name: 'code'; email: string; sent: EmailCodeSent }
  | { name: 'done'; verified: VerifiedEmail }

/**
 * 메일 인증 코드로 이메일을 확인한 뒤 그 이메일로 할 일(가입·비밀번호 재설정)을 보여 준다.
 * ① 이메일 → 코드 받기 ② 숫자 6자리 확인 ③ children(인증한 이메일과 토큰, 처음으로 돌아가기)
 * 코드 받기는 가입 여부와 상관없이 같은 응답이라 안내도 하나다. 다시 받기는 resendAfterSeconds 동안 막는다.
 * 단계를 넘기면 새 단계의 첫 칸으로 포커스한다(누른 버튼이 사라져 포커스가 모달 밖으로 나가지 않게).
 */
export function EmailVerification({
  purpose,
  label,
  autoFocus = false,
  initialEmail = '',
  intro,
  onBack,
  children,
}: {
  purpose: EmailCodePurpose
  /** 이메일 단계 폼 이름 (예: 이메일로 가입) */
  label: string
  /** 처음 열 때 이메일 칸으로 포커스할지(다른 화면에서 넘어왔으면 true) */
  autoFocus?: boolean
  initialEmail?: string
  /** 이메일 단계의 안내 */
  intro?: ReactNode
  /** 로그인으로 돌아가기 */
  onBack: () => void
  children: (verified: VerifiedEmail, restart: RestartVerification) => ReactNode
}) {
  const [step, setStep] = useState<Step>({ name: 'email', email: initialEmail })
  // 단계를 바꿨는지. 바꾼 뒤에는 새 단계의 첫 칸으로 포커스한다.
  const [moved, setMoved] = useState(false)
  const go = (next: Step) => {
    setMoved(true)
    setStep(next)
  }

  if (step.name === 'code')
    return (
      <CodeStep
        purpose={purpose}
        email={step.email}
        sent={step.sent}
        onVerified={(token) =>
          go({ name: 'done', verified: { email: step.email, token } })
        }
        onChangeEmail={() => go({ name: 'email', email: step.email })}
      />
    )
  if (step.name === 'done')
    return children(step.verified, (emailError) =>
      go({
        name: 'email',
        email: step.verified.email,
        error: emailError ? { email: emailError } : { form: EXPIRED_MESSAGE },
      }),
    )
  return (
    <EmailStep
      purpose={purpose}
      label={label}
      initialEmail={step.email}
      initialError={step.error}
      autoFocus={autoFocus || moved}
      intro={intro}
      onSent={(email, sent) => go({ name: 'code', email, sent })}
      onBack={onBack}
    />
  )
}

function EmailStep({
  purpose,
  label,
  initialEmail,
  initialError,
  autoFocus,
  intro,
  onSent,
  onBack,
}: {
  purpose: EmailCodePurpose
  label: string
  initialEmail: string
  initialError?: { email?: string; form?: string }
  autoFocus: boolean
  intro?: ReactNode
  onSent: (email: string, sent: EmailCodeSent) => void
  onBack: () => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [failure, setFailure] = useState(initialError?.form ?? null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fields = useFieldErrors({
    ids: EMAIL_FIELD,
    order: ['email'],
    errors: { email: emailError(email) ?? undefined },
  })
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  // 다음 단계에서 이메일 때문에 돌아왔으면 그 칸에 이유를 보여 준다(처음 그릴 때 한 번).
  const emailProblem = initialError?.email
  useEffect(() => {
    if (emailProblem)
      fields.showServerErrors([{ field: 'email', message: emailProblem }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = useMutation({
    mutationFn: sendEmailCode,
    onSuccess: (sent, { email }) => onSent(email, sent),
    onError: (error) => {
      if (!fields.applyServerErrors(error)) setFailure(error.message)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit() || send.isPending) return
    send.mutate({ email: email.trim(), purpose })
  }

  return (
    <form
      className="form"
      aria-label={label}
      noValidate
      onSubmit={submit}
      {...fields.formProps}
    >
      <Field
        id={EMAIL_FIELD.email}
        label="이메일"
        error={fields.error('email')}
      >
        <input
          ref={inputRef}
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          {...fields.inputProps('email')}
          onChange={(e) => {
            fields.changed('email')
            setFailure(null)
            setEmail(e.target.value)
          }}
        />
      </Field>
      {intro}
      {failure && (
        <p className="notice bad" role="alert">
          {failure}
        </p>
      )}
      <button
        type="submit"
        className="btn primary block"
        disabled={send.isPending}
        {...fields.submitProps}
      >
        인증 코드 받기
      </button>
      <button type="button" className="btn ghost sm" onClick={onBack}>
        로그인으로 돌아가기
      </button>
    </form>
  )
}

function CodeStep({
  purpose,
  email,
  sent: firstSent,
  onVerified,
  onChangeEmail,
}: {
  purpose: EmailCodePurpose
  email: string
  sent: EmailCodeSent
  onVerified: (token: string) => void
  onChangeEmail: () => void
}) {
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(firstSent)
  const [failure, setFailure] = useState<string | null>(null)
  const cooldown = useCooldown(firstSent.resendAfterSeconds)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const fields = useFieldErrors({
    ids: CODE_FIELD,
    order: ['code'],
    errors: {
      code: !code
        ? '인증 코드를 입력해 주세요.'
        : /^\d{6}$/.test(code)
          ? undefined
          : '인증 코드는 숫자 6자리예요.',
    },
  })

  const verify = useMutation({
    mutationFn: verifyEmailCode,
    onSuccess: ({ emailVerificationToken }) =>
      onVerified(emailVerificationToken),
    onError: (error) => {
      if (isApiError(error) && CODE_ERRORS.has(error.code))
        fields.showServerErrors([{ field: 'code', message: error.message }])
      else if (!fields.applyServerErrors(error)) setFailure(error.message)
    },
  })
  const resend = useMutation({
    mutationFn: sendEmailCode,
    onSuccess: (next) => {
      setSent(next)
      cooldown.start(next.resendAfterSeconds)
      setCode('')
      fields.reset()
      // 누른 버튼이 막히므로 새 코드를 넣을 칸으로 포커스한다.
      inputRef.current?.focus()
    },
    onError: (error) => setFailure(error.message),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit() || verify.isPending) return
    verify.mutate({ email, purpose, code })
  }

  return (
    <form
      className="form"
      aria-label="인증 코드 확인"
      noValidate
      onSubmit={submit}
      {...fields.formProps}
    >
      <p className="notice" role="status">
        메일을 확인해 주세요. 메일이 오지 않으면{' '}
        {minutes(sent.resendAfterSeconds)}분 뒤 다시 받거나 이메일 주소를 확인해
        주세요.
      </p>
      <Field
        id={CODE_FIELD.code}
        label="인증 코드"
        error={fields.error('code')}
        hint={`${email}에 보낸 숫자 6자리예요. ${minutes(sent.expiresInSeconds)}분 동안 쓸 수 있어요.`}
      >
        <input
          ref={inputRef}
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          {...fields.inputProps('code')}
          // 숫자 사이 공백·하이픈을 붙여 넣어도 숫자만 6자리까지 남긴다.
          onChange={(e) => {
            fields.changed('code')
            setFailure(null)
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          }}
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
        disabled={verify.isPending}
        {...fields.submitProps}
      >
        확인
      </button>
      <button
        type="button"
        className="btn sm"
        disabled={cooldown.left > 0 || resend.isPending}
        onClick={() => {
          setFailure(null)
          resend.mutate({ email, purpose })
        }}
      >
        {cooldown.left > 0
          ? `코드 다시 받기 (${cooldown.left}초)`
          : '코드 다시 받기'}
      </button>
      <button type="button" className="btn ghost sm" onClick={onChangeEmail}>
        이메일 바꾸기
      </button>
    </form>
  )
}

/** 초를 분으로 올려 센다(60초 → 1분) */
function minutes(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60))
}
