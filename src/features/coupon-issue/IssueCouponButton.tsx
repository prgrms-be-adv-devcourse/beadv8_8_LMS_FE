import type { CouponSummary } from '@/entities/coupon/types'
import { formatDate } from '@/shared/lib/date'
import styles from './IssueCouponButton.module.css'
import {
  ISSUE_DELAYED_MESSAGE,
  ISSUE_UNKNOWN_MESSAGE,
  useIssueCoupon,
  type IssueCouponState,
} from './useIssueCoupon'

/**
 * 쿠폰 한 장의 발급 버튼과 진행·결과 안내. 소진이면 '소진', 이미 받았으면 '받음'으로 막는다.
 * 안내는 role="status"라 바뀌면 화면 낭독기가 읽는다(처음부터 그려 둔다).
 */
export function IssueCouponButton({
  coupon,
  lectureId,
}: {
  coupon: CouponSummary
  lectureId: number
}) {
  const { state, issue } = useIssueCoupon(coupon.couponId, lectureId)
  const { label, disabled } = buttonOf(coupon, state)
  return (
    <div className={styles.issue}>
      <button
        type="button"
        className="btn primary sm"
        disabled={disabled}
        aria-busy={state.phase === 'processing'}
        onClick={issue}
      >
        {label}
      </button>
      <span role="status" className={styles.message}>
        {messageOf(state)}
      </span>
    </div>
  )
}

function buttonOf(
  coupon: CouponSummary,
  state: IssueCouponState,
): { label: string; disabled: boolean } {
  const failedWith = state.phase === 'failed' ? state.code : null
  // 목록의 받음·소진은 이 화면에서 아직 요청하지 않았을 때만 따른다. 받음에는 접수만 된 요청도 들어 있어,
  // 응답을 놓친 요청을 같은 ID로 다시 보낼 길을 막지 않도록 요청을 보낸 뒤에는 훅의 상태를 따른다.
  const untouched = state.phase === 'idle'
  if (
    (untouched && coupon.issued) ||
    state.phase === 'issued' ||
    failedWith === 'COUPON_ALREADY_ISSUED'
  )
    return { label: '받음', disabled: true }
  if ((untouched && coupon.soldOut) || failedWith === 'COUPON_SOLD_OUT')
    return { label: '소진', disabled: true }
  // 처리 중에는 다시 보내지 않고, 발급 거절은 다시 눌러도 결과가 같다.
  return {
    label: '발급받기',
    disabled: state.phase === 'processing' || state.phase === 'rejected',
  }
}

function messageOf(state: IssueCouponState): string {
  switch (state.phase) {
    case 'idle':
      return ''
    case 'processing':
      return '처리 중…'
    case 'issued':
      return state.expiresAt
        ? `발급 완료 · ${formatDate(state.expiresAt)}까지 쓸 수 있어요`
        : '발급 완료'
    case 'rejected':
      return state.reason
        ? `발급되지 않았습니다. ${state.reason}`
        : '발급되지 않았습니다'
    case 'delayed':
      return ISSUE_DELAYED_MESSAGE
    case 'unknown':
      return ISSUE_UNKNOWN_MESSAGE
    case 'failed':
      return state.message
  }
}
