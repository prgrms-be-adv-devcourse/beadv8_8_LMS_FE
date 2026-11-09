import {
  discountLabel,
  expiryRuleLabel,
  issuePeriodLabel,
  remainingOf,
  targetLabel,
} from '@/entities/coupon/rules'
import type { Coupon } from '@/entities/coupon/types'
import { CouponStatusPill } from '@/entities/coupon/ui/CouponStatusPill'
import { formatNumber } from '@/shared/lib/money'

/** 쿠폰 한 장의 조건(상세·신청 결과 공용) */
export function CouponFacts({
  coupon,
  lectureTitle,
}: {
  coupon: Coupon
  lectureTitle?: string
}) {
  return (
    <dl className="kv">
      <dt>상태</dt>
      <dd>
        <CouponStatusPill status={coupon.status} />
      </dd>
      <dt>강의</dt>
      <dd>{targetLabel(coupon.targetType, lectureTitle)}</dd>
      <dt>할인</dt>
      <dd>{discountLabel(coupon)}</dd>
      <dt>수량</dt>
      <dd className="num">
        남은 {formatNumber(remainingOf(coupon))}장 / 전체{' '}
        {formatNumber(coupon.quantity)}장
      </dd>
      <dt>발급 기간</dt>
      <dd>{issuePeriodLabel(coupon)}</dd>
      <dt>만료</dt>
      <dd>{expiryRuleLabel(coupon)}</dd>
      <dt>다른 쿠폰과 함께</dt>
      <dd>{coupon.stackable ? '쓸 수 있어요' : '쓸 수 없어요'}</dd>
      {coupon.status === 'REJECTED' && coupon.rejectReason && (
        <>
          <dt>반려 사유</dt>
          <dd className="c-bad">{coupon.rejectReason}</dd>
        </>
      )}
    </dl>
  )
}
