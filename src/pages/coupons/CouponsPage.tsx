import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { myCouponsQuery } from '@/entities/coupon/api'
import { MemberCouponStatusPill } from '@/entities/coupon/ui/CouponStatusPill'
import {
  discountLabel,
  MEMBER_COUPON_STATUS,
  targetLabel,
} from '@/entities/coupon/rules'
import type { MemberCoupon, MemberCouponStatus } from '@/entities/coupon/types'
import { lectureQuery } from '@/entities/lecture/api'
import { formatDate } from '@/shared/lib/date'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './CouponsPage.module.css'

const FILTERS: { status: MemberCouponStatus; empty: string }[] = [
  { status: 'AVAILABLE', empty: '지금 쓸 수 있는 쿠폰이 없어요' },
  { status: 'RESERVED', empty: '주문에 쓰고 있는 쿠폰이 없어요' },
  { status: 'USED', empty: '사용한 쿠폰이 없어요' },
  { status: 'EXPIRED', empty: '만료된 쿠폰이 없어요' },
]

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 사용 가능이고, 기본값일 때는 URL에서 뺀다. */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const status =
    FILTERS.find((f) => f.status === params.get('status'))?.status ??
    'AVAILABLE'
  const setStatus = (next: MemberCouponStatus) => {
    const search = new URLSearchParams()
    if (next !== 'AVAILABLE') search.set('status', next)
    setParams(search)
  }
  return [status, setStatus] as const
}

export function CouponsPage() {
  const [status, setStatus] = useStatusParam()
  const { data, error, isPending, refetch } = useQuery(myCouponsQuery(status))
  const filter = FILTERS.find((f) => f.status === status) ?? FILTERS[0]
  const available = status === 'AVAILABLE'

  return (
    <div className="page">
      <PageHead
        title="쿠폰함"
        lede="받은 쿠폰을 모아 봐요. 쿠폰은 강의 상세에서 받을 수 있고, 만료일이 지나면 쓸 수 없어요."
      />
      <div className="toolbar">
        <div role="group" aria-label="쿠폰 상태" className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.status}
              type="button"
              className={status === f.status ? 'btn sm primary' : 'btn sm'}
              aria-pressed={status === f.status}
              onClick={() => setStatus(f.status)}
            >
              {MEMBER_COUPON_STATUS[f.status][1]}
            </button>
          ))}
        </div>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState
          title={filter.empty}
          action={
            available && (
              <Link className="btn primary" to="/lectures">
                강의 둘러보기
              </Link>
            )
          }
        >
          {available && '강의 상세에서 받을 수 있는 쿠폰을 확인해 보세요.'}
        </EmptyState>
      ) : (
        <section className="panel">
          <ul className={`rows ${styles.list}`} aria-label="쿠폰 목록">
            {data.map((coupon) => (
              <CouponItem key={coupon.memberCouponId} coupon={coupon} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CouponItem({ coupon }: { coupon: MemberCoupon }) {
  return (
    <li className="row-item" aria-label={coupon.couponName}>
      <div className="row-main">
        <div className={styles.head}>
          <b className="row-title">{coupon.couponName}</b>
          <MemberCouponStatusPill status={coupon.status} />
          {coupon.stackable && (
            <span className="pill line">다른 쿠폰과 함께 사용 가능</span>
          )}
        </div>
        <span className={styles.discount}>{discountLabel(coupon)}</span>
        <span className="fine">
          <CouponTarget coupon={coupon} />
          {` · ${formatDate(coupon.expiresAt)}까지`}
        </span>
      </div>
    </li>
  )
}

/** 쓸 수 있는 강의. 특정 강의면 강의를 불러와 제목을 보이고, 불러오는 중이거나 못 불러오면 '특정 강의'로 둔다. */
function CouponTarget({ coupon }: { coupon: MemberCoupon }) {
  const lectureId = coupon.targetType === 'LECTURE' ? coupon.lectureId : null
  const { data: lecture } = useQuery({
    ...lectureQuery(lectureId ?? 0),
    enabled: lectureId !== null,
  })
  if (lectureId === null) return targetLabel(coupon.targetType)
  return (
    <Link to={`/lectures/${lectureId}`}>
      {targetLabel('LECTURE', lecture?.title)}
    </Link>
  )
}
