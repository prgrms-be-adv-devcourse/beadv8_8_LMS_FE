import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { formatRestorableUntil } from '@/entities/member/withdrawal'
import { isApiError } from '@/shared/api/ApiError'
import { cancelRestore, restoreMember } from '@/shared/auth/me'

/** 다시 눌러도 복구할 수 없는 실패(BE가 복구 티켓 쿠키를 지운다). 로그인부터 다시 한다 */
const FINAL_FAILURE: Record<string, string | null> = {
  // 티켓이 없거나 만료(10분): BE 문구를 그대로 쓴다.
  INVALID_RESTORE_TICKET: null,
  LOGIN_NOT_ALLOWED: '복구 기한이 지나 계정을 복구할 수 없어요.',
}

/**
 * 탈퇴 회원 복구 질문. 복구 기한 안의 탈퇴 회원이 로그인하면(비밀번호 409, 구글 /login?error=) 묻는다.
 * 복구 티켓은 BE가 쿠키로만 다뤄 여기서는 본문 없이 부른다. 복구는 계정만 되살리고 로그인은 부른 쪽이 다시 한다.
 * 복구하지 않으면 티켓을 지운다(지우지 못해도 10분 뒤 만료되므로 로그인 화면으로 돌아간다).
 * 티켓 만료(401)·기한 지남(403)은 로그인 화면으로 돌아가 다시 로그인하게 하고, 그 밖의 실패(503 RESTORE_UNAVAILABLE 등)는
 * 티켓이 남아 있으므로 여기서 알리고 같은 버튼으로 다시 시도하게 한다.
 */
export function RestorePrompt({
  restorableUntil,
  busy = false,
  onRestored,
  onCancelled,
  onFailed,
  onAskingChange,
}: {
  /** 복구할 수 있는 마지막 시각(LocalDateTime, KST). 없거나 읽을 수 없으면 날짜 없이 묻는다 */
  restorableUntil: string | null
  /** 복구 뒤 다시 로그인하는 중이면 버튼을 막는다 */
  busy?: boolean
  /** 복구했다. 같은 방식으로 다시 로그인한다 */
  onRestored: () => void
  /** 복구하지 않았다 */
  onCancelled: () => void
  /** 다시 눌러도 복구할 수 없다. 이 안내와 함께 로그인 화면으로 돌아간다 */
  onFailed: (message: string) => void
  /** 아직 고르지 않았는지(복구 티켓이 남아 있는지). 고르지 않고 모달을 닫으면 부른 쪽이 티켓을 지운다 */
  onAskingChange: (asking: boolean) => void
}) {
  const until = formatRestorableUntil(restorableUntil)
  const restore = useMutation({
    mutationFn: restoreMember,
    onSuccess: onRestored,
    onError: (error) => {
      if (isApiError(error) && Object.hasOwn(FINAL_FAILURE, error.code))
        onFailed(FINAL_FAILURE[error.code] ?? error.message)
    },
  })
  const cancel = useMutation({
    mutationFn: cancelRestore,
    onSettled: onCancelled,
  })
  const pending = busy || restore.isPending || cancel.isPending
  // 복구하기를 눌러 실패(503)했으면 티켓이 남아 아직 묻는 중이다.
  const asking = !(restore.isPending || restore.isSuccess || !cancel.isIdle)
  useEffect(() => {
    onAskingChange(asking)
    return () => onAskingChange(false)
  }, [asking, onAskingChange])

  return (
    <div className="form" role="group" aria-label="계정 복구">
      <p>
        <b>
          탈퇴한 계정이에요.{' '}
          {until
            ? `${until}까지 복구할 수 있어요.`
            : '탈퇴하고 30일 안에는 복구할 수 있어요.'}
        </b>
      </p>
      <p className="fine">복구하면 탈퇴 전처럼 이용할 수 있어요. 복구할까요?</p>
      {restore.error && (
        <p className="notice bad" role="alert">
          {restore.error.message}
        </p>
      )}
      <button
        type="button"
        className="btn primary block"
        disabled={pending}
        onClick={() => restore.mutate()}
      >
        복구하기
      </button>
      <button
        type="button"
        className="btn block"
        disabled={pending}
        onClick={() => cancel.mutate()}
      >
        복구하지 않기
      </button>
    </div>
  )
}
