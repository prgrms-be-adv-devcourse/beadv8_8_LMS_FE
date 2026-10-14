import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { updateMe } from '@/entities/member/api'
import { nicknameError } from '@/entities/member/nickname'
import { toast } from '@/shared/ui/toastStore'
import { useApplyMe } from './useUpdateMe'

export function NicknameForm({ current }: { current: string }) {
  const [nickname, setNickname] = useState(current)
  const applyMe = useApplyMe()
  const save = useMutation({
    mutationFn: updateMe,
    onSuccess: async (me) => {
      await applyMe(me)
      setNickname(me.nickname)
      toast('닉네임을 바꿨어요.')
    },
    onError: (error) => toast(error.message),
  })
  const error = nicknameError(nickname)
  const changed = nickname.trim() !== current

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!error && changed) save.mutate({ nickname: nickname.trim() })
  }

  return (
    <form className="field" onSubmit={submit}>
      <label htmlFor="settings-nickname">닉네임</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="settings-nickname"
          className="input"
          value={nickname}
          maxLength={20}
          aria-invalid={changed && error !== null}
          aria-describedby="settings-nickname-hint"
          onChange={(e) => setNickname(e.target.value)}
        />
        <button
          type="submit"
          className="btn"
          disabled={!changed || error !== null || save.isPending}
        >
          저장
        </button>
      </div>
      <span
        id="settings-nickname-hint"
        className={changed && error ? 'fine c-bad' : 'fine'}
      >
        {changed && error
          ? error
          : '채팅, 리뷰, 모집 글에 보여요. 2~12자, 한글·영문·숫자·공백·밑줄.'}
      </span>
    </form>
  )
}
