import type { MemberCoupon, MemberCouponStatus } from '@/entities/coupon/types'
import { daysUntil, isPast, parseServerDate } from '@/shared/lib/date'

/** 쿠폰함 보기: 사용 가능(가진 쿠폰) / 지난 쿠폰(사용·만료) */
export type CouponView = 'usable' | 'past'

/** 만료 임박으로 강조하는 남은 날(오늘 포함) */
export const EXPIRING_DAYS = 3

/**
 * 사용 가능 보기에 두는 상태. 주문에 묶인 쿠폰(RESERVED)은 주문이 취소되면 돌아오므로 함께 둔다.
 * 사용·만료와 BE가 새로 더한 모르는 상태는 쓸 수 있다고 단정하지 않고 지난 쿠폰에 둔다
 */
const HELD: MemberCouponStatus[] = ['AVAILABLE', 'RESERVED']

export const viewOf = (coupon: MemberCoupon): CouponView =>
  HELD.includes(coupon.status) ? 'usable' : 'past'

/** 곧 만료: 쓸 수 있고 아직 지나지 않았으며 남은 날이 EXPIRING_DAYS 이하 */
export const isExpiringSoon = (coupon: MemberCoupon, now = new Date()) =>
  coupon.status === 'AVAILABLE' &&
  !isPast(coupon.expiresAt, now) &&
  daysUntil(coupon.expiresAt, now) <= EXPIRING_DAYS

const expiresAtMs = (coupon: MemberCoupon) =>
  parseServerDate(coupon.expiresAt).getTime()

/**
 * 쿠폰함을 두 보기로 나누고 요약 수를 센다. 사용 가능 보기는 쓸 수 있는 쿠폰을 만료가 가까운 순으로 앞에,
 * 주문에 묶인 쿠폰을 뒤에 둔다. 지난 쿠폰은 받은 순서(서버 순서) 그대로다
 */
export function splitCoupons(coupons: MemberCoupon[], now = new Date()) {
  const usable = coupons
    .filter((c) => viewOf(c) === 'usable')
    .sort((a, b) => {
      const rank = (c: MemberCoupon) => (c.status === 'AVAILABLE' ? 0 : 1)
      return rank(a) - rank(b) || expiresAtMs(a) - expiresAtMs(b)
    })
  return {
    usable,
    past: coupons.filter((c) => viewOf(c) === 'past'),
    available: coupons.filter((c) => c.status === 'AVAILABLE').length,
    expiring: coupons.filter((c) => isExpiringSoon(c, now)).length,
  }
}
