import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { adminInquiriesQuery } from '@/entities/inquiry/api'
import { inspectionsQuery } from '@/entities/lecture/api'
import { channelReviewsQuery, upgradeReviewsQuery } from '@/entities/member/api'
import { payoutFailuresQuery } from '@/entities/payout/api'
import { adminExchangesQuery } from '@/entities/wallet/adminExchangeApi'
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
  const payouts = useQuery(payoutFailuresQuery(0))
  const exchanges = useQuery(adminExchangesQuery('REQUESTED', 0))

  return (
    <div className="page">
      <PageHead
        title="운영 대시보드"
        lede="관리자는 거래 당사자가 되지 않아요. 심사와 판단 결과만 남기고, HP 이동은 지갑이 처리해요."
      />
      <section className="summary" aria-label="업무별 대기 건수">
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
          label="답변 대기 문의"
          to="/admin/inquiries"
          query={inquiries}
        />
        <SummaryCard label="지급 실패" to="/admin/payouts" query={payouts} />
        <SummaryCard
          label="환전 승인 대기"
          to="/admin/exchanges"
          query={exchanges}
        />
      </section>
    </div>
  )
}

/** 카드마다 따로 불러온다. 실패한 카드만 그 자리에서 다시 시도한다(링크 안에 버튼을 둘 수 없어 링크를 풀어 그린다). */
function SummaryCard({
  label,
  to,
  query,
}: {
  label: string
  to: string
  query: CountQuery
}) {
  const { data, error, isPending, refetch } = query
  if (!data && error)
    return (
      <div className="sum" role="group" aria-label={label}>
        <span>{label}</span>
        <p className="c-bad">불러오지 못했어요</p>
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
  return (
    <Link
      to={to}
      className={`sum sum-btn ${styles.card}`}
      aria-busy={isPending}
    >
      <span>{label}</span>
      <b>
        {isPending || total === undefined
          ? '불러오는 중…'
          : total === 0
            ? '모두 처리함'
            : `${formatNumber(total)}건`}
      </b>
    </Link>
  )
}
