import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Link } from 'react-router'
import { myCouponsQuery } from '@/entities/coupon/api'
import { MemberCouponStatusPill } from '@/entities/coupon/ui/CouponStatusPill'
import { CouponValue } from '@/entities/coupon/ui/CouponValue'
import { discountLabel, targetLabel } from '@/entities/coupon/rules'
import type { MemberCoupon } from '@/entities/coupon/types'
import { lectureQuery } from '@/entities/lecture/api'
import { formatDate, formatDday } from '@/shared/lib/date'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import {
  displayStatusOf,
  EXPIRING_DAYS,
  isExpiringSoon,
  splitCoupons,
  type CouponView,
} from './couponBox'
import styles from './CouponsPage.module.css'

const VIEWS: { view: CouponView; label: string }[] = [
  { view: 'usable', label: '사용 가능' },
  { view: 'past', label: '지난 쿠폰' },
]

/** 보기는 URL ?view=에 둔다. 없거나 모르는 값이면 사용 가능이고, 기본값일 때는 URL에서 뺀다 */
function useViewParam() {
  const [params, merge] = useMergedSearchParams()
  const view: CouponView = params.get('view') === 'past' ? 'past' : 'usable'
  const setView = (next: CouponView) =>
    merge((current) => {
      const search = new URLSearchParams(current)
      // 예전 상태 필터(?status=)는 이제 쓰지 않는다.
      search.delete('status')
      if (next === 'past') search.set('view', 'past')
      else search.delete('view')
      return search
    })
  return [view, setView] as const
}

export function CouponsPage() {
  const [view, setView] = useViewParam()
  // 요약(사용 가능·곧 만료)과 두 보기를 한 번에 그리려고 상태 없이 모두 불러와 나눈다.
  const { data, error, isPending, refetch } = useQuery(myCouponsQuery(null))

  return (
    <div className="page">
      <PageHead
        title="쿠폰함"
        lede="받은 쿠폰을 모아 봐요. 결제할 때 골라 쓸 수 있고, 만료일이 지나면 쓸 수 없어요."
      />
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <CouponBox coupons={data} view={view} onView={setView} />
      )}
    </div>
  )
}

function CouponBox({
  coupons,
  view,
  onView,
}: {
  coupons: MemberCoupon[]
  view: CouponView
  onView: (view: CouponView) => void
}) {
  const { usable, past, available, expiring } = splitCoupons(coupons)
  const shown = view === 'usable' ? usable : past
  return (
    <>
      <dl className={styles.summary} aria-label="쿠폰 요약">
        <div className={styles.stat}>
          <dt>사용 가능</dt>
          <dd>
            <b className="num">{available}</b>장
          </dd>
          <span className={styles.statHint}>결제할 때 골라 써요</span>
        </div>
        <div
          className={
            expiring > 0 ? `${styles.stat} ${styles.alert}` : styles.stat
          }
        >
          <dt>곧 만료</dt>
          <dd>
            <b className="num">{expiring}</b>장
          </dd>
          <span className={styles.statHint}>{EXPIRING_DAYS}일 안에 끝나요</span>
        </div>
      </dl>
      <div className="toolbar">
        <div role="group" aria-label="쿠폰 보기" className={styles.filters}>
          {VIEWS.map((v) => (
            <button
              key={v.view}
              type="button"
              className={view === v.view ? 'btn sm primary' : 'btn sm'}
              aria-pressed={view === v.view}
              onClick={() => onView(v.view)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length > 0 ? (
        <ul className={styles.list} aria-label="쿠폰 목록">
          {shown.map((coupon) => (
            <CouponItem key={coupon.memberCouponId} coupon={coupon} />
          ))}
        </ul>
      ) : view === 'usable' ? (
        <EmptyState
          title="쓸 수 있는 쿠폰이 없어요"
          action={
            <Link className="btn primary" to="/lectures">
              강의 보러 가기
            </Link>
          }
        >
          강의 상세의 '쿠폰 받기'에서 받을 수 있어요
        </EmptyState>
      ) : (
        <EmptyState title="지난 쿠폰이 없어요">
          사용했거나 만료된 쿠폰이 여기에 모여요.
        </EmptyState>
      )}
    </>
  )
}

function CouponItem({ coupon }: { coupon: MemberCoupon }) {
  const nameId = useId()
  const status = displayStatusOf(coupon)
  const usable = status === 'AVAILABLE'
  const expiring = isExpiringSoon(coupon)
  const className = [
    styles.ticket,
    usable ? '' : styles.spent,
    expiring ? styles.expiring : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <li className={className} aria-label={coupon.couponName}>
      <div className={styles.stub}>
        <CouponValue
          discountType={coupon.discountType}
          discountValue={coupon.discountValue}
        />
      </div>
      <div className={styles.body}>
        <div className={styles.head}>
          <b id={nameId} className="row-title">
            {coupon.couponName}
          </b>
          <MemberCouponStatusPill status={status} />
          {coupon.stackable && (
            <span className="pill line">다른 쿠폰과 함께 사용 가능</span>
          )}
        </div>
        <span className={styles.discount}>{discountLabel(coupon)}</span>
        <span className={`fine ${styles.target}`}>
          <CouponTarget coupon={coupon} />
        </span>
        <div className={styles.foot}>
          <span className={styles.expiry}>
            {`${formatDate(coupon.expiresAt)}까지`}
            {expiring && (
              <span className={styles.soon}>
                <span className="num">{formatDday(coupon.expiresAt)}</span> 곧
                만료돼요
              </span>
            )}
          </span>
          {usable && <UseLink coupon={coupon} describedBy={nameId} />}
        </div>
      </div>
    </li>
  )
}

/** 쓸 수 있는 강의로 가는 길: 특정 강의는 그 강의 상세, 모든 강의는 강의 목록 */
function UseLink({
  coupon,
  describedBy,
}: {
  coupon: MemberCoupon
  describedBy: string
}) {
  const lecture = coupon.targetType === 'LECTURE' && coupon.lectureId !== null
  return (
    <Link
      className={`btn sm ${styles.use}`}
      to={lecture ? `/lectures/${coupon.lectureId}` : '/lectures'}
      aria-describedby={describedBy}
    >
      {lecture ? '강의 보기' : '강의 둘러보기'}
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </Link>
  )
}

/** 쓸 수 있는 강의. 특정 강의면 강의를 불러와 제목을 보이고, 불러오는 중이거나 못 불러오면 '특정 강의'로 둔다. */
function CouponTarget({ coupon }: { coupon: MemberCoupon }) {
  const lectureId = coupon.targetType === 'LECTURE' ? coupon.lectureId : null
  const { data: lecture } = useQuery({
    ...lectureQuery(lectureId ?? 0),
    enabled: lectureId !== null,
  })
  return lectureId === null
    ? targetLabel(coupon.targetType)
    : targetLabel('LECTURE', lecture?.title)
}
