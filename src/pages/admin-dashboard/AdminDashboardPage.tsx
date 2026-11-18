import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { appearanceHpTasksQuery } from '@/entities/appearance-hp-task/api'
import { adminCouponsQuery } from '@/entities/coupon/api'
import { adminInquiriesQuery } from '@/entities/inquiry/api'
import { inspectionsQuery } from '@/entities/lecture/api'
import { channelReviewsQuery, upgradeReviewsQuery } from '@/entities/member/api'
import { lectureHpTasksQuery } from '@/entities/hp-task/api'
import {
  adminExchangePayoutsQuery,
  adminExchangesQuery,
} from '@/entities/wallet/adminExchangeApi'
import { formatNumber } from '@/shared/lib/money'
import { PageHead } from '@/shared/ui/PageHead'
import styles from './AdminDashboardPage.module.css'

/** 카드가 쓰는 목록 조회 결과. 전체 건수(page.totalElements)만 본다 */
type CountQuery = {
  data?: { page: { totalElements: number } }
  error: Error | null
  isPending: boolean
  refetch: () => unknown
}

/**
 * 관리자 첫 화면. 통합 요약 API가 없어 각 관리 목록의 첫 페이지 전체 건수를 모은다.
 * 목록 화면 머리글 건수와 같은 쿼리라 캐시와 처리 후 무효화를 함께 쓴다.
 */
export function AdminDashboardPage() {
  const channels = useQuery(channelReviewsQuery('PENDING', 0))
  const promotions = useQuery(upgradeReviewsQuery('PENDING', 0))
  const lectures = useQuery(
    inspectionsQuery({ status: 'PENDING_INSPECTION', page: 0 }),
  )
  const inquiries = useQuery(
    adminInquiriesQuery({ status: 'WAITING', sort: 'OLDEST', page: 0 }),
  )
  const hpTasks = useQuery(lectureHpTasksQuery({ status: 'DEAD', page: 0 }))
  const appearanceHpTasks = useQuery(
    appearanceHpTasksQuery({ status: 'DEAD', page: 0 }),
  )
  const exchanges = useQuery(adminExchangesQuery('REQUESTED', 0))
  const failedExchanges = useQuery(adminExchangesQuery('FAILED', 0))
  const payouts = useQuery(
    adminExchangePayoutsQuery('MANUAL_REVIEW_REQUIRED', 0),
  )
  // 쿠폰 목록은 페이지 없는 배열이라 길이를 전체 건수로 바꿔 다른 카드와 같은 모양으로 둔다(캐시는 목록 화면과 같다).
  const coupons = useQuery({
    ...adminCouponsQuery('REVIEW'),
    select: (list) => ({ page: { totalElements: list.length } }),
  })

  return (
    <div className="page">
      <PageHead
        title="운영 대시보드"
        lede="관리자는 거래 당사자가 되지 않아요. 심사와 판단 결과만 남기고, HP 이동은 지갑이 처리해요."
      />
      <section className={styles.board} aria-label="업무별 대기 건수">
        <CardGroup title="심사" hint="판단을 기다리는 신청">
          <SummaryCard
            label="채널 인증 대기"
            to="/admin/channels"
            query={channels}
          />
          <SummaryCard
            label="승급 심사 대기"
            to="/admin/promotions"
            query={promotions}
          />
          <SummaryCard
            label="강의 검수 대기"
            to="/admin/lectures"
            query={lectures}
          />
          <SummaryCard
            label="쿠폰 심사 대기"
            to="/admin/coupons"
            query={coupons}
          />
        </CardGroup>
        <CardGroup title="돈" hint="HP·현금이 움직이는 일">
          <SummaryCard
            label="환전 승인 대기"
            to="/admin/exchanges"
            query={exchanges}
          />
          <SummaryCard
            label="송금 확인 필요"
            to="/admin/exchange-payouts"
            query={payouts}
            tone="bad"
          />
          <SummaryCard
            label="송금 실패 판단 대기"
            to="/admin/exchanges?status=FAILED"
            query={failedExchanges}
            tone="bad"
          />
          <SummaryCard
            label="멈춘 강의 HP 작업"
            to="/admin/hp-tasks"
            query={hpTasks}
            tone="bad"
          />
          <SummaryCard
            label="멈춘 출연 HP 작업"
            to="/admin/appearance-hp-tasks"
            query={appearanceHpTasks}
            tone="bad"
          />
        </CardGroup>
        <CardGroup title="지원" hint="회원의 질문">
          <SummaryCard
            label="답변 대기 문의"
            to="/admin/inquiries"
            query={inquiries}
          />
        </CardGroup>
      </section>
    </div>
  )
}

/** 업무 묶음. 머리는 눈금처럼 작게 두고 카드가 주인공이다 */
function CardGroup({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className={styles.group}>
      <h2 className={styles.groupHead}>
        {title}
        <span className={styles.groupHint}>{hint}</span>
      </h2>
      <div className={styles.cards}>{children}</div>
    </div>
  )
}

/**
 * 카드마다 따로 불러온다. 실패한 카드만 그 자리에서 다시 시도한다(링크 안에 버튼을 둘 수 없어 링크를 풀어 그린다).
 * 대기 건이 있으면 탤리 램프를 켠다. 돈이 멈춘 업무(tone=bad)는 위험색으로 켠다.
 */
function SummaryCard({
  label,
  to,
  query,
  tone = 'signal',
}: {
  label: string
  to: string
  query: CountQuery
  tone?: 'signal' | 'bad'
}) {
  const { data, error, isPending, refetch } = query
  if (!data && error)
    return (
      <div
        className={`${styles.card} ${styles.failed}`}
        role="group"
        aria-label={label}
      >
        <span className={styles.label}>{label}</span>
        <p className={`c-bad ${styles.failText}`}>불러오지 못했어요</p>
        <div className={styles.actions}>
          <button type="button" className="btn sm" onClick={() => refetch()}>
            다시 시도
          </button>
          <Link to={to} className="btn ghost sm">
            목록 열기
          </Link>
        </div>
      </div>
    )

  const total = data?.page.totalElements
  const loading = isPending || total === undefined
  const waiting = !loading && total > 0
  return (
    <Link
      to={to}
      className={`${styles.card} ${styles.link}`}
      data-state={loading ? 'loading' : waiting ? tone : 'clear'}
      aria-busy={isPending}
    >
      <span className={styles.label}>
        <span className={styles.lamp} aria-hidden="true" />
        {label}
      </span>
      {loading ? (
        <span className={styles.count}>
          <span className={styles.skel} aria-hidden="true" />
          <span className="sr-only">불러오는 중…</span>
        </span>
      ) : total === 0 ? (
        <span className={`${styles.count} ${styles.clear}`}>모두 처리함</span>
      ) : (
        <span className={styles.count}>
          <b className={styles.number}>{formatNumber(total)}</b>
          <span className={styles.unit}>건</span>
        </span>
      )}
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
    </Link>
  )
}
