import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  formatAvailableAt,
  withdrawalBlockReasons,
  withdrawalShortcut,
  type WithdrawalBlockReason,
} from '@/entities/member/withdrawal'
import { useWithdraw } from '@/shared/auth/session'
import styles from './account.module.css'

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
    <form
      className={`panel ${styles.withdraw}`}
      aria-label="탈퇴하기"
      onSubmit={submit}
    >
      <div className={styles.withdrawHead}>
        <h2>마지막 확인</h2>
        <p className="fine">탈퇴하면 바로 로그아웃되고 첫 화면으로 가요.</p>
      </div>
      {withdraw.error && (
        <p className={`notice bad ${styles.reveal}`} role="alert">
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
        className={`btn danger block ${styles.confirm} ${styles.busy}`}
        disabled={!agree || withdraw.isPending}
        aria-busy={withdraw.isPending || undefined}
      >
        탈퇴하기
      </button>
    </form>
  )
}

function BlockReasons({ reasons }: { reasons: WithdrawalBlockReason[] }) {
  return (
    <div className={`${styles.blocks} ${styles.reveal}`}>
      <p className={styles.blockHead} aria-hidden="true">
        정리할 항목 <span className={styles.count}>{reasons.length}</span>
      </p>
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
                    {formatAvailableAt(reason.availableAt)} 이후 탈퇴할 수
                    있어요.
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
    </div>
  )
}
