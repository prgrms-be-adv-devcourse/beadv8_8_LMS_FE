import { useQuery } from '@tanstack/react-query'
import { lectureCouponsQuery } from '@/entities/coupon/api'
import {
  discountLabel,
  expiryRuleLabel,
  remainingOf,
} from '@/entities/coupon/rules'
import { formatNumber } from '@/shared/lib/money'
import { IssueCouponButton } from './IssueCouponButton'

/**
 * 강의 상세의 '받을 수 있는 쿠폰'. 이 강의에 지금 받을 수 있는 쿠폰(특정 강의 + 모든 강의)을 발급 버튼과 함께 보인다.
 * 쿠폰이 없거나 불러오지 못하면 영역째 숨긴다(강의 화면을 막지 않는다). 회원에게만 그린다(부르는 쪽이 정한다)
 */
export function LectureCoupons({ lectureId }: { lectureId: number }) {
  const { data: coupons } = useQuery(lectureCouponsQuery(lectureId))
  if (!coupons || coupons.length === 0) return null
  return (
    <section className="panel" aria-labelledby="lecture-coupons-title">
      <div className="panel-head">
        <h2 id="lecture-coupons-title">받을 수 있는 쿠폰</h2>
        <span className="fine num">{coupons.length}장</span>
      </div>
      <div className="rows">
        {coupons.map((coupon) => (
          <div
            key={coupon.couponId}
            className="row-item"
            role="group"
            aria-label={coupon.name}
          >
            <div className="row-main">
              <span className="row-title">
                {coupon.name}{' '}
                {coupon.stackable && (
                  <span className="pill info">중복 사용 가능</span>
                )}
              </span>
              <span>{discountLabel(coupon)}</span>
              <span className="fine">
                {`${expiryRuleLabel(coupon)} · 남은 수량 ${formatNumber(remainingOf(coupon))}장`}
              </span>
            </div>
            <IssueCouponButton coupon={coupon} lectureId={lectureId} />
          </div>
        ))}
      </div>
    </section>
  )
}
