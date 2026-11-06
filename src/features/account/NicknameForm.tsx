import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { updateMe } from '@/entities/member/api'
import {
  NICKNAME_ERROR_CODES,
  NICKNAME_TAKEN,
  nicknameError,
} from '@/entities/member/nickname'
import { useNicknameAvailability } from '@/entities/member/useNicknameAvailability'
import { isApiError } from '@/shared/api/ApiError'
import { Field } from '@/shared/ui/Field'
import { toast } from '@/shared/ui/toastStore'
import { useApplyMe } from './useUpdateMe'

const INPUT_ID = 'settings-nickname'
const HINT_ID = 'settings-nickname-hint'

/**
 * 닉네임 변경. 규칙 오류는 입력하는 대로, 다른 회원이 쓰는 닉네임은 칸을 벗어날 때 미리 확인해 칸 오류로 보인다.
 * 저장이 닉네임 때문에 실패하면(409 DUPLICATE_NICKNAME 등) 그 문구를 칸 오류로 보이고 값을 고칠 때까지 저장을 막는다.
 */
export function NicknameForm({ current }: { current: string }) {
  const [nickname, setNickname] = useState(current)
  const [serverError, setServerError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const changed = nickname.trim() !== current
  const availability = useNicknameAvailability(nickname, { skip: !changed })
  const applyMe = useApplyMe()
  const save = useMutation({
    mutationFn: updateMe,
    onSuccess: async (me) => {
      await applyMe(me)
      setNickname(me.nickname)
      toast('닉네임을 바꿨어요.')
    },
    onError: (error) => {
      if (isApiError(error) && NICKNAME_ERROR_CODES.has(error.code)) {
        setServerError(error.message)
        inputRef.current?.focus()
      } else toast(error.message)
    },
  })
  const error =
    nicknameError(nickname) ??
    serverError ??
    (availability.taken ? NICKNAME_TAKEN : null)
  const shown = changed ? error : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!error && changed) save.mutate({ nickname: nickname.trim() })
  }

  return (
    <form onSubmit={submit}>
      <Field
        id={INPUT_ID}
        label="닉네임"
        error={shown ?? undefined}
        hint={
          <span id={HINT_ID}>
            채팅, 리뷰, 모집 글에 보여요. 2~12자, 한글·영문·숫자·공백·밑줄.
          </span>
        }
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            id={INPUT_ID}
            className="input"
            value={nickname}
            maxLength={20}
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? `${INPUT_ID}-error` : HINT_ID}
            onChange={(e) => {
              setServerError(null)
              setNickname(e.target.value)
            }}
            onBlur={availability.check}
          />
          <button
            type="submit"
            className="btn"
            disabled={!changed || error !== null || save.isPending}
          >
            저장
          </button>
        </div>
      </Field>
    </form>
  )
}
