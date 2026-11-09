import { statusOf } from '@/shared/lib/statusLabel'
import { COUPON_STATUS, MEMBER_COUPON_STATUS } from '../rules'
import type { CouponStatus, MemberCouponStatus } from '../types'

/** 쿠폰(정책) 상태 배지. BE가 모르는 상태를 더하면 '알 수 없는 상태'로 보인다 */
export function CouponStatusPill({ status }: { status: CouponStatus }) {
  const [tone, label] = statusOf(COUPON_STATUS, status)
  return <span className={`pill ${tone}`}>{label}</span>
}

/** 내 쿠폰(받은 쿠폰) 상태 배지 */
export function MemberCouponStatusPill({
  status,
}: {
  status: MemberCouponStatus
}) {
  const [tone, label] = statusOf(MEMBER_COUPON_STATUS, status)
  return <span className={`pill ${tone}`}>{label}</span>
}
