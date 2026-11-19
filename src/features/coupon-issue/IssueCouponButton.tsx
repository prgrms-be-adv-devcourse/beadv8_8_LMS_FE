import type { CouponSummary } from '@/entities/coupon/types'
import styles from './IssueCouponButton.module.css'
import { issueButtonOf } from './issueView'
import type { IssueCouponState } from './useIssueCoupon'

/**
 * 쿠폰 한 장의 발급 버튼. 소진이면 '소진', 이미 받았으면 '받음'으로 막는다.
 * locked면 '모두 받기'가 차례로 보내는 중이라 누르지 못하게 한다(진행·결과 안내는 부르는 쪽이 role="status"로 둔다)
 */
export function IssueCouponButton({
  coupon,
  state,
  onIssue,
  locked = false,
}: {
  coupon: CouponSummary
  state: IssueCouponState
  onIssue: () => void
  locked?: boolean
}) {
  const { label, disabled } = issueButtonOf(coupon, state)
  const processing = state.phase === 'processing'
  const done = label === '받음'
  return (
    <button
      type="button"
      className={
        done
          ? `btn sm ${styles.button} ${styles.done}`
          : `btn primary sm ${styles.button}`
      }
      disabled={disabled || locked}
      aria-busy={processing}
      // 쿠폰마다 같은 글자의 버튼이라 읽을 때 구분되게 쿠폰 이름을 넣는다.
      aria-label={`${coupon.name} ${label}`}
      onClick={onIssue}
    >
      {processing && <span className="spinner sm" aria-hidden="true" />}
      {done && (
        <svg
          className={styles.check}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
      {label}
    </button>
  )
}
