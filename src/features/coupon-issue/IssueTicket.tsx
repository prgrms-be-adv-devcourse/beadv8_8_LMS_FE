import {
  discountLabel,
  expiryRuleLabel,
  remainingOf,
} from '@/entities/coupon/rules'
import type { CouponSummary } from '@/entities/coupon/types'
import { CouponValue } from '@/entities/coupon/ui/CouponValue'
import { formatNumber } from '@/shared/lib/money'
import { IssueCouponButton } from './IssueCouponButton'
import { issueButtonOf, issueMessageOf } from './issueView'
import styles from './IssueTicket.module.css'
import type { IssueCouponState } from './useIssueCoupon'

const FAILED_PHASES: IssueCouponState['phase'][] = [
  'failed',
  'rejected',
  'unknown',
]

/**
 * 받을 수 있는 쿠폰 한 장(티켓): 할인 값 · 이름 · 할인 · 만료 방식과 남은 수량 · 발급 버튼 · 진행·결과 안내.
 * 강의 상세 팝업과 쿠폰 받기 화면이 같이 쓴다. locked면 '모두 받기'가 차례로 보내는 중이라 버튼을 잠근다
 */
export function IssueTicket({
  coupon,
  state,
  locked,
  onIssue,
}: {
  coupon: CouponSummary
  state: IssueCouponState
  locked: boolean
  onIssue: () => void
}) {
  // 이미 받은 쿠폰(409)은 실패가 아니라 '받음'이다.
  const failed =
    FAILED_PHASES.includes(state.phase) &&
    issueButtonOf(coupon, state).label !== '받음'
  return (
    <div
      className={failed ? `${styles.ticket} ${styles.failed}` : styles.ticket}
      role="group"
      aria-label={coupon.name}
    >
      <div className={styles.stub}>
        <CouponValue
          discountType={coupon.discountType}
          discountValue={coupon.discountValue}
        />
      </div>
      <div className={styles.body}>
        <span className="row-title">
          {coupon.name}{' '}
          {coupon.stackable && (
            <span className="pill info">중복 사용 가능</span>
          )}
        </span>
        <span className={styles.discount}>{discountLabel(coupon)}</span>
        <span className="fine">
          {`${expiryRuleLabel(coupon)} · 남은 수량 ${formatNumber(remainingOf(coupon))}장`}
        </span>
      </div>
      <div className={styles.action}>
        <IssueCouponButton
          coupon={coupon}
          state={state}
          locked={locked}
          onIssue={onIssue}
        />
      </div>
      {/* 바뀌면 화면 낭독기가 읽도록 처음부터 그려 둔다 */}
      <p role="status" className={styles.message}>
        {issueMessageOf(state)}
      </p>
    </div>
  )
}
