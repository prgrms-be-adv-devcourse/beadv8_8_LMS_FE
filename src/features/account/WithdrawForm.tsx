import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  formatAvailableAt,
  withdrawalBlockReasons,
  withdrawalShortcut,
  type WithdrawalBlockReason,
} from '@/entities/member/withdrawal'
import { useWithdraw } from '@/shared/auth/session'

/**
 * 탈퇴 동의와 탈퇴하기. 요청 중에는 다시 누르지 못하게 막는다(두 번 누르면 409 WITHDRAWAL_IN_PROGRESS).
 * 막히면(409 WITHDRAWAL_BLOCKED) BE가 한 번에 준 정리할 항목을 보여 주고, 정리한 뒤 다시 누를 수 있다.
 */
export function WithdrawForm() {
  const [agree, setAgree] = useState(false)
  const withdraw = useWithdraw()
  const reasons = withdrawalBlockReasons(withdraw.error)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!agree || withdraw.isPending) return
    withdraw.mutate()
  }

  return (
    <form className="panel" aria-label="탈퇴하기" onSubmit={submit}>
      {withdraw.error && (
        <p className="notice bad" role="alert">
          {withdraw.error.message}
        </p>
      )}
      {reasons && reasons.length > 0 && <BlockReasons reasons={reasons} />}
      <label className="consent" htmlFor="withdraw-agree">
        <input
          id="withdraw-agree"
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        <span>위 내용을 확인했고 탈퇴할게요.</span>
      </label>
      <button
        type="submit"
        className="btn danger block"
        disabled={!agree || withdraw.isPending}
      >
        탈퇴하기
      </button>
    </form>
  )
}

function BlockReasons({ reasons }: { reasons: WithdrawalBlockReason[] }) {
  return (
    <ul className="rows wd-list" aria-label="탈퇴 전에 정리할 항목">
      {reasons.map((reason, i) => {
        const shortcut = withdrawalShortcut(reason.code)
        return (
          <li key={`${reason.code}-${i}`} className="wd-row">
            <span className="wd-mark bad" aria-hidden="true">
              !
            </span>
            <div className="row-main">
              <span>{reason.message}</span>
              {reason.availableAt && (
                <span className="fine">
                  {formatAvailableAt(reason.availableAt)} 이후 탈퇴할 수 있어요.
                </span>
              )}
            </div>
            {shortcut && (
              <Link className="btn sm" to={shortcut.to}>
                {shortcut.label}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
