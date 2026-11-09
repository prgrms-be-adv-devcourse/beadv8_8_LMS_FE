import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { adminCouponQuery, adminCouponsQuery } from '@/entities/coupon/api'
import {
  discountLabel,
  expiryRuleLabel,
  issuePeriodLabel,
  remainingOf,
  targetLabel,
} from '@/entities/coupon/rules'
import type { Coupon, CouponStatus, CouponType } from '@/entities/coupon/types'
import { CouponStatusPill } from '@/entities/coupon/ui/CouponStatusPill'
import {
  AdminCouponActions,
  CouponRetryNotices,
} from '@/features/coupon-admin/AdminCouponActions'
import { PlatformCouponFormModal } from '@/features/coupon-admin/PlatformCouponFormModal'
import { formatNumber } from '@/shared/lib/money'
import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminCouponsPage.module.css'

/** 상태 필터. 처음은 판매자가 심사를 요청한 쿠폰(REVIEW)이다 */
const FILTERS: { status: CouponStatus; label: string; empty: string }[] = [
  { status: 'REVIEW', label: '심사 중', empty: '심사할 쿠폰이 없어요' },
  { status: 'DRAFT', label: '열기 전', empty: '열기 전 쿠폰이 없어요' },
  { status: 'OPEN', label: '발급 중', empty: '발급 중인 쿠폰이 없어요' },
  {
    status: 'SUSPENDED',
    label: '발급 중단',
    empty: '발급을 중단한 쿠폰이 없어요',
  },
  { status: 'REJECTED', label: '반려', empty: '반려한 쿠폰이 없어요' },
  { status: 'CLOSED', label: '종료', empty: '종료한 쿠폰이 없어요' },
]
const DEFAULT_STATUS: CouponStatus = 'REVIEW'

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 심사 중이다 */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const status =
    FILTERS.find((f) => f.status === params.get('status'))?.status ??
    DEFAULT_STATUS
  const setStatus = (next: CouponStatus) => {
    const search = new URLSearchParams()
    if (next !== DEFAULT_STATUS) search.set('status', next)
    setParams(search)
  }
  return [status, setStatus] as const
}

/** 목록(/admin/coupons)과 상세(/admin/coupons/:couponId)가 같은 화면을 쓴다 */
export function AdminCouponsPage() {
  const couponId = useParams().couponId
  return couponId === undefined ? (
    <CouponList />
  ) : (
    <CouponDetail couponId={Number(couponId)} />
  )
}

function CouponList() {
  const [status, setStatus] = useStatusParam()
  const [creating, setCreating] = useState(false)
  const { data, error, isPending, refetch } = useQuery(
    adminCouponsQuery(status),
  )
  const filter = FILTERS.find((f) => f.status === status) ?? FILTERS[0]

  return (
    <div className="page">
      <PageHead
        title="쿠폰 운영"
        lede="판매자가 신청한 쿠폰을 심사하고, 플랫폼 쿠폰을 만들어 발급을 열고 닫아요. 발급을 중단해도 이미 받은 쿠폰은 쓸 수 있어요."
        actions={
          <button
            type="button"
            className="btn primary"
            onClick={() => setCreating(true)}
          >
            플랫폼 쿠폰 만들기
          </button>
        }
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
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <CouponRetryNotices shown={data?.map((c) => c.couponId) ?? []} />
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title={filter.empty} />
      ) : (
        <section className="panel">
          <ul className={styles.list} aria-label="쿠폰 목록">
            {data.map((coupon) => (
              <CouponItem key={coupon.couponId} coupon={coupon} />
            ))}
          </ul>
        </section>
      )}
      {creating && (
        <PlatformCouponFormModal onClose={() => setCreating(false)} />
      )}
    </div>
  )
}

function CouponItem({ coupon }: { coupon: Coupon }) {
  return (
    <li className="q-item" aria-label={`${coupon.name} 쿠폰`}>
      <div className="row-main">
        <div className={styles.head}>
          <Link to={`/admin/coupons/${coupon.couponId}`}>
            <b>{coupon.name}</b>
          </Link>
          <StatusPill coupon={coupon} />
          <span className="pill line">{typeLabel(coupon)}</span>
        </div>
        <span className="fine">
          {targetOf(coupon)} · {discountLabel(coupon)} · 발급{' '}
          {formatNumber(coupon.issuedCount)}/{formatNumber(coupon.quantity)}장
        </span>
        <span className="fine">발급 기간 {issuePeriodLabel(coupon)}</span>
        {coupon.rejectReason && (
          <span className="fine c-bad">반려 사유: {coupon.rejectReason}</span>
        )}
      </div>
      <AdminCouponActions coupon={coupon} />
    </li>
  )
}

const back = (
  <Link className="back" to="/admin/coupons">
    ← 쿠폰 운영
  </Link>
)

function CouponDetail({ couponId }: { couponId: number }) {
  const valid = Number.isInteger(couponId) && couponId > 0
  const { data, error, isPending, refetch } = useQuery({
    ...adminCouponQuery(couponId),
    enabled: valid,
  })
  if (!valid)
    return (
      <div className="page">
        {back}
        <EmptyState title="쿠폰을 찾을 수 없어요" />
      </div>
    )
  if (isPending)
    return (
      <div className="page">
        {back}
        <Loading />
      </div>
    )
  if (error)
    return (
      <div className="page">
        {back}
        <LoadError error={error} retry={refetch} />
      </div>
    )

  return (
    <div className="page">
      {back}
      <PageHead
        title={data.name}
        actions={<StatusPill coupon={data} />}
        lede={
          data.status === 'DRAFT' && data.type === 'PLATFORM'
            ? '아직 발급 전이에요. 열면 예산을 확보하고 발급을 시작해요.'
            : undefined
        }
      />
      <section className="panel" aria-label="쿠폰 정보">
        <dl className="kv">
          <dt>종류</dt>
          <dd>
            {typeLabel(data)}
            {data.type === 'SELLER' && data.applicantId !== null && (
              <span className="fine"> · 신청 회원 #{data.applicantId}</span>
            )}
          </dd>
          <dt>대상</dt>
          <dd>
            {targetOf(data)}
            {data.basePrice !== null && (
              <span className="fine">
                {' '}
                · 신청 때 가격 {formatNumber(data.basePrice)} HP
              </span>
            )}
          </dd>
          <dt>할인</dt>
          <dd>{discountLabel(data)}</dd>
          <dt>발급 기간</dt>
          <dd>{issuePeriodLabel(data)}</dd>
          <dt>발급 수량</dt>
          <dd className="num">
            {formatNumber(data.issuedCount)} / {formatNumber(data.quantity)}장
            (남은 {formatNumber(remainingOf(data))}장)
          </dd>
          <dt>만료</dt>
          <dd>{expiryRuleLabel(data)}</dd>
          <dt>함께 쓰기</dt>
          <dd>
            {data.stackable
              ? '다른 쿠폰과 함께 쓸 수 있어요'
              : '다른 쿠폰과 함께 쓸 수 없어요'}
          </dd>
          {data.rejectReason && (
            <>
              <dt>반려 사유</dt>
              <dd className={`c-bad ${styles.reason}`}>{data.rejectReason}</dd>
            </>
          )}
        </dl>
        <div className={styles.actions}>
          <AdminCouponActions coupon={data} />
        </div>
      </section>
    </div>
  )
}

const TYPE_LABEL: Record<CouponType, string> = {
  SELLER: '판매자 쿠폰',
  PLATFORM: '플랫폼 쿠폰',
}

/** BE가 모르는 종류를 더해도 판매자 쿠폰으로 잘못 보이지 않게 표에서 찾는다 */
const typeLabel = (coupon: Coupon) =>
  lookup(TYPE_LABEL, coupon.type) ?? UNKNOWN_NAME

/** 관리자 화면은 강의 제목 대신 강의 번호를 보인다(목록마다 강의를 따로 조회하지 않는다) */
const targetOf = (coupon: Coupon) =>
  targetLabel(
    coupon.targetType,
    coupon.lectureId === null ? undefined : `강의 #${coupon.lectureId}`,
  )

/** 플랫폼 쿠폰의 DRAFT는 판매자 신청이 아니라 '열기 전'이다. 그 밖에는 공용 상태 배지 */
function StatusPill({ coupon }: { coupon: Coupon }) {
  if (coupon.status === 'DRAFT' && coupon.type === 'PLATFORM')
    return <span className="pill line">열기 전</span>
  return <CouponStatusPill status={coupon.status} />
}
