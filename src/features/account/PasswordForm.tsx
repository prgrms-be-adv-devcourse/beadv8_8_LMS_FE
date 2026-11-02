import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { passwordError } from '@/entities/member/password'
import { isApiError } from '@/shared/api/ApiError'
import { changePassword } from '@/shared/auth/me'
import { pauseRefreshWhile } from '@/shared/auth/token'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import { toast } from '@/shared/ui/toastStore'

const FIELD_ID = {
  currentPassword: 'settings-current-password',
  newPassword: 'settings-new-password',
  newPasswordConfirm: 'settings-new-password-confirm',
} as const
type FieldKey = keyof typeof FIELD_ID
const FIELD_ORDER = [
  'currentPassword',
  'newPassword',
  'newPasswordConfirm',
] as const

/** BE 오류 코드가 가리키는 칸 */
const CODE_FIELD: Record<string, FieldKey> = {
  INVALID_CURRENT_PASSWORD: 'currentPassword',
  INVALID_PASSWORD_LENGTH: 'newPassword',
  INVALID_PASSWORD_CHARACTER: 'newPassword',
  PASSWORD_LETTER_AND_DIGIT_REQUIRED: 'newPassword',
}

const EMPTY = { currentPassword: '', newPassword: '', newPasswordConfirm: '' }

/**
 * 비밀번호 변경. BE가 가입 방식을 알려 주지 않아 모든 회원에게 보이고, 구글로 가입한 회원이면 BE가 막는다
 * (409 PASSWORD_NOT_SET). 바꾸면 이 기기는 새 refresh token 쿠키로 토큰을 다시 받고, 다른 기기는 다시 로그인해야 한다.
 */
export function PasswordForm() {
  const [values, setValues] = useState(EMPTY)
  const [failure, setFailure] = useState<string | null>(null)
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: {
      currentPassword: values.currentPassword
        ? undefined
        : '현재 비밀번호를 입력해 주세요.',
      newPassword: passwordError(values.newPassword) ?? undefined,
      newPasswordConfirm: !values.newPasswordConfirm
        ? '새 비밀번호를 한 번 더 입력해 주세요.'
        : values.newPasswordConfirm !== values.newPassword
          ? '새 비밀번호가 서로 달라요.'
          : undefined,
    },
  })
  const save = useMutation({
    mutationFn: async (body: {
      currentPassword: string
      newPassword: string
    }) =>
      // 쿠키를 바꾸는 작업이라 로그인·로그아웃과 하나씩 한다. 그동안 다른 재발급이 끼어 폐기된 쿠키로 덮어쓰거나,
      // 변경 중 로그아웃한 뒤 새 쿠키로 다시 로그인되지 않게 한다.
      pauseRefreshWhile(async (refresh) => {
        // 새 토큰으로 보낸다(변경 요청은 재발급하지 않는다).
        await refresh().catch(() => null)
        await changePassword(body)
        // 바꾸면서 받은 새 쿠키로 토큰을 다시 받는다(옛 토큰도 만료 전까지 쓸 수 있어 실패해도 그대로 둔다).
        await refresh().catch(() => null)
      }),
    onSuccess: () => {
      setValues(EMPTY)
      fields.reset()
      toast('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해 주세요.')
    },
    onError: (error) => {
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
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
  }

  return (
    <section className="panel" aria-labelledby="settings-password-title">
      <h2 id="settings-password-title">비밀번호</h2>
      <p className="fine">
        가입한 방식(구글 또는 이메일·비밀번호)으로만 로그인할 수 있어요. 구글로
        가입한 계정은 비밀번호가 없어요.
      </p>
      <form
        className="form"
        aria-label="비밀번호 변경"
        noValidate
        onSubmit={submit}
        {...fields.formProps}
      >
        <Field
          id={FIELD_ID.currentPassword}
          label="현재 비밀번호"
          error={fields.error('currentPassword')}
        >
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            {...fields.inputProps('currentPassword')}
            onChange={(e) => set('currentPassword')(e.target.value)}
          />
        </Field>
        <Field
          id={FIELD_ID.newPassword}
          label="새 비밀번호"
          error={fields.error('newPassword')}
          hint="8~64자, 영문과 숫자를 하나 이상씩. 공백·한글은 쓸 수 없어요."
        >
          <input
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
        {failure && (
          <p className="notice bad" role="alert">
            {failure}
          </p>
        )}
        <button
          type="submit"
          className="btn"
          disabled={save.isPending}
          {...fields.submitProps}
        >
          비밀번호 바꾸기
        </button>
      </form>
    </section>
  )
}
