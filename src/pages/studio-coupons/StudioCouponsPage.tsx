import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { sellerCouponQuery, sellerCouponsQuery } from '@/entities/coupon/api'
import { CouponStatusPill } from '@/entities/coupon/ui/CouponStatusPill'
import {
  COUPON_STATUS,
  discountLabel,
  issuePeriodLabel,
  remainingOf,
  targetLabel,
} from '@/entities/coupon/rules'
import type { Coupon, CouponStatus } from '@/entities/coupon/types'
import { CouponApplyForm } from '@/features/coupon-seller/CouponApplyForm'
import { CouponFacts } from '@/features/coupon-seller/CouponFacts'
import { SellerCouponActions } from '@/features/coupon-seller/SellerCouponActions'
import {
  useMyLectureOptions,
  type MyLectureOptions,
} from '@/features/coupon-seller/useMyLectureOptions'
import { formatNumber } from '@/shared/lib/money'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './StudioCouponsPage.module.css'

/** 상태 필터 순서. 필터가 없으면 전체 */
const STATUSES = Object.keys(COUPON_STATUS) as CouponStatus[]

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 전체(null)다 */
function useStatusParam() {
  const [params, merge] = useMergedSearchParams()
  const raw = params.get('status')
  const status = STATUSES.find((s) => s === raw) ?? null
  const setStatus = (next: CouponStatus | null) => {
    const search = new URLSearchParams()
    if (next) search.set('status', next)
    merge(() => search)
  }
  return [status, setStatus] as const
}

/** 판매자 쿠폰: 신청 폼과 내 쿠폰 목록. `/studio/coupons/:couponId`는 그 쿠폰 상세 */
export function StudioCouponsPage() {
  const { couponId } = useParams()
  const lectures = useMyLectureOptions()
  const id = Number(couponId)

  return (
    <div className="page">
      <PageHead
        title="쿠폰 신청"
        lede="판매 중인 내 강의에 할인 쿠폰을 신청해요. 심사를 요청하면 관리자가 확인한 뒤 발급이 시작돼요."
        actions={
          <Link className="btn" to="/studio">
            강의 판매
          </Link>
        }
      />
      {couponId === undefined ? (
        <>
          <ApplyPanel lectures={lectures} />
          <MyCoupons lectures={lectures} />
        </>
      ) : Number.isInteger(id) && id > 0 ? (
        <CouponDetail couponId={id} lectures={lectures} />
      ) : (
        <EmptyState
          title="쿠폰을 찾을 수 없어요"
          action={
            <Link className="btn" to="/studio/coupons">
              내 쿠폰 목록
            </Link>
          }
        />
      )}
    </div>
  )
}

/** 신청 폼. 신청하면 그 자리에서 결과(신청됨)와 심사 요청 버튼을 보여 준다 */
function ApplyPanel({ lectures }: { lectures: MyLectureOptions }) {
  const [created, setCreated] = useState<Coupon | null>(null)

  return (
    <section
      className={`panel ${styles.panel}`}
      aria-labelledby="coupon-apply-title"
    >
      <div className={styles.panelHead}>
        <span className={styles.eyebrow} aria-hidden="true">
          New coupon
        </span>
        <h2 id="coupon-apply-title">새 쿠폰</h2>
      </div>
      {created ? (
        <CreatedResult
          created={created}
          lectures={lectures}
          onDone={setCreated}
          onAgain={() => setCreated(null)}
        />
      ) : (
        <CouponApplyForm lectures={lectures} onCreated={setCreated} />
      )}
    </section>
  )
}

/**
 * 신청 결과 문구. 신청(DRAFT)·심사 요청(REVIEW) 뒤에는 할 일을 안내하고,
 * 그 밖(승인돼 발급 중·반려·중단·종료, 모르는 상태)은 심사 요청으로 단정하지 않는다.
 * 실제 상태는 바로 아래 CouponFacts의 CouponStatusPill이 보인다(모르는 상태는 '알 수 없음').
 */
function createdMessage(status: Coupon['status']) {
  if (status === 'DRAFT')
    return '쿠폰을 신청했어요. 심사를 요청해야 관리자가 확인해요.'
  if (status === 'REVIEW') return '쿠폰 심사를 요청했어요.'
  return '쿠폰 상태가 바뀌었어요. 아래에서 지금 상태를 확인해 주세요.'
}

/**
 * 신청 결과. 신청 응답으로 시작하고 그 쿠폰의 상세 쿼리를 구독해, 아래 목록에서 심사를 요청하는 등 상태가 바뀌면 함께 바뀐다
 * (조작은 상세 캐시를 고치고 판매자 쿠폰 쿼리를 다시 부른다)
 */
function CreatedResult({
  created,
  lectures,
  onDone,
  onAgain,
}: {
  created: Coupon
  lectures: MyLectureOptions
  onDone: (coupon: Coupon) => void
  onAgain: () => void
}) {
  const { data } = useQuery({
    ...sellerCouponQuery(created.couponId),
    // 상세를 불러오기 전(또는 불러오지 못하면)에는 신청 응답을 보인다.
    placeholderData: created,
  })
  const coupon = data ?? created
  return (
    <div className={styles.result}>
      <p role="status">
        <b>{coupon.name}</b> {createdMessage(coupon.status)}
      </p>
      <CouponFacts
        coupon={coupon}
        lectureTitle={lectures.titleOf(coupon.lectureId)}
      />
      <div className={styles.actions}>
        <SellerCouponActions coupon={coupon} onDone={onDone} />
        <button type="button" className="btn sm ghost" onClick={onAgain}>
          다른 쿠폰 신청
        </button>
      </div>
    </div>
  )
}

function MyCoupons({ lectures }: { lectures: MyLectureOptions }) {
  const [status, setStatus] = useStatusParam()
  const { data, error, isPending, refetch } = useQuery(
    sellerCouponsQuery(status),
  )

  return (
    <section
      className={`panel ${styles.panel}`}
      aria-labelledby="coupon-list-title"
    >
      <div className={styles.panelHead}>
        <span className={styles.eyebrow} aria-hidden="true">
          My coupons
        </span>
        <h2 id="coupon-list-title">내 쿠폰</h2>
      </div>
      <div className="toolbar">
        <div role="group" aria-label="쿠폰 상태" className={styles.filters}>
          {[null, ...STATUSES].map((s) => (
            <button
              key={s ?? 'ALL'}
              type="button"
              className={styles.filter}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s ? COUPON_STATUS[s][1] : '전체'}
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
          title={
            status
              ? `'${COUPON_STATUS[status][1]}' 쿠폰이 없어요`
              : '신청한 쿠폰이 없어요'
          }
        />
      ) : (
        <ul className={styles.list}>
          {data.map((coupon) => (
            <CouponRow
              key={coupon.couponId}
              coupon={coupon}
              lectureTitle={lectures.titleOf(coupon.lectureId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function CouponRow({
  coupon,
  lectureTitle,
}: {
  coupon: Coupon
  lectureTitle?: string
}) {
  // 더는 발급하지 않는 쿠폰(중단·종료)은 한 단계 흐리게 둔다.
  const ended = coupon.status === 'SUSPENDED' || coupon.status === 'CLOSED'
  const issuedRatio =
    coupon.quantity > 0
      ? Math.min(1, (coupon.quantity - remainingOf(coupon)) / coupon.quantity)
      : 0
  return (
    <li
      className={ended ? `${styles.ticket} ${styles.muted}` : styles.ticket}
      aria-label={coupon.name}
    >
      <DiscountStub coupon={coupon} />
      <div className={styles.ticketBody}>
        <div className={styles.head}>
          <Link
            className={`row-title ${styles.name}`}
            to={`/studio/coupons/${coupon.couponId}`}
          >
            {coupon.name}
          </Link>
          <CouponStatusPill status={coupon.status} />
        </div>
        <span className="fine">
          {targetLabel(coupon.targetType, lectureTitle)} ·{' '}
          {discountLabel(coupon)}
        </span>
        <span className={styles.period}>{issuePeriodLabel(coupon)}</span>
        <div className={styles.usage}>
          <span className={styles.meter} aria-hidden="true">
            <span style={{ transform: `scaleX(${issuedRatio})` }} />
          </span>
          <span className={styles.count}>
            남은 {formatNumber(remainingOf(coupon))}장 /{' '}
            {formatNumber(coupon.quantity)}장
          </span>
        </div>
        {coupon.status === 'REJECTED' && coupon.rejectReason && (
          <p className={`app-note ${styles.reason}`}>
            반려 사유: {coupon.rejectReason}
          </p>
        )}
      </div>
      <div className={styles.ticketActions}>
        <SellerCouponActions coupon={coupon} />
      </div>
    </li>
  )
}

/** 쿠폰 왼쪽 꼬리표: 할인 크기를 크게. 글은 본문의 할인 문구가 이미 읽어 준다 */
function DiscountStub({ coupon }: { coupon: Coupon }) {
  const value =
    coupon.discountType === 'RATE' ? (
      <>
        {coupon.discountValue}
        <small>%</small>
      </>
    ) : coupon.discountType === 'AMOUNT' ? (
      <>
        {formatNumber(coupon.discountValue)}
        <small>HP</small>
      </>
    ) : (
      '—'
    )
  return (
    <div className={styles.stub} aria-hidden="true">
      <span className={styles.value}>{value}</span>
      <span className={styles.off}>OFF</span>
    </div>
  )
}

function CouponDetail({
  couponId,
  lectures,
}: {
  couponId: number
  lectures: MyLectureOptions
}) {
  const { data, error, isPending, refetch } = useQuery(
    sellerCouponQuery(couponId),
  )

  return (
    <section
      className={`panel ${styles.panel}`}
      aria-labelledby="coupon-detail-title"
    >
      <h2 id="coupon-detail-title">{data?.name ?? '쿠폰 상세'}</h2>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <>
          <CouponFacts
            coupon={data}
            lectureTitle={lectures.titleOf(data.lectureId)}
          />
          <div className={styles.actions}>
            <SellerCouponActions coupon={data} />
          </div>
        </>
      )}
      <div className={styles.actions}>
        <Link className="btn sm ghost" to="/studio/coupons">
          내 쿠폰 목록
        </Link>
      </div>
    </section>
  )
}
