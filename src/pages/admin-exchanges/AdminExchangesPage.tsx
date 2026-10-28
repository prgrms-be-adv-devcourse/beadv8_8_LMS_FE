import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { adminExchangesQuery } from '@/entities/wallet/adminExchangeApi'
import {
  SETTLEMENT_NOTE,
  formatSettlementDate,
} from '@/entities/wallet/exchange'
import {
  ADMIN_EXCHANGE_FILTERS,
  type AdminExchangeFilter,
  applicantLabel,
  approveBlockReason,
  isExchangeReviewable,
} from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { ExchangeStatusPill } from '@/entities/wallet/ui/ExchangeStatusPill'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminExchangesPage.module.css'

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 승인 대기다. 바꾸면 첫 페이지로 간다. */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const status: AdminExchangeFilter =
    ADMIN_EXCHANGE_FILTERS.find((f) => f.status === params.get('status'))
      ?.status ?? 'REQUESTED'
  const setStatus = (next: AdminExchangeFilter) => {
    const search = new URLSearchParams()
    if (next !== 'REQUESTED') search.set('status', next)
    setParams(search)
  }
  return [status, setStatus] as const
}

export function AdminExchangesPage() {
  const [status, setStatus] = useStatusParam()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(adminExchangesQuery(status, page))
  const moving = useClampPage(page, query, setPage)
  // 머리글 건수는 상태와 관계없이 승인 대기 기준이다(대시보드 카드와 같은 쿼리).
  const pending = useQuery(adminExchangesQuery('REQUESTED', 0))
  const pendingCount = pending.data?.page.totalElements
  const { data, error, isPending, refetch } = query
  const filter =
    ADMIN_EXCHANGE_FILTERS.find((f) => f.status === status) ??
    ADMIN_EXCHANGE_FILTERS[0]

  return (
    <div className="page">
      <PageHead
        title="환전 승인"
        lede="인플루언서의 수익 HP 환전 신청을 승인하거나 거절해요. 승인해도 바로 송금하지 않고, 거절하면 보류한 수익 HP를 신청자에게 돌려줘요."
        actions={
          pendingCount !== undefined &&
          (pendingCount > 0 ? (
            <span className="pill warn">
              대기 {formatNumber(pendingCount)}건
            </span>
          ) : (
            <span className="pill ok">모두 처리함</span>
          ))
        }
      />
      <div className="toolbar">
        <div role="group" aria-label="환전 상태" className={styles.tabs}>
          {ADMIN_EXCHANGE_FILTERS.map((f) => (
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
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title={filter.empty} />
      ) : (
        <section className="panel">
          <div className="tbl-wrap">
            <table className="tbl" aria-label="환전 신청 목록">
              <thead>
                <tr>
                  <th>신청 일시</th>
                  <th>신청자</th>
                  <th className="r">신청 HP</th>
                  <th className="r">수수료</th>
                  <th className="r">예상 수령액(원)</th>
                  <th>정산 예정일</th>
                  <th>상태</th>
                  <th aria-label="상세" />
                </tr>
              </thead>
              <tbody>
                {data.content.map((exchange) => (
                  <ExchangeRow key={exchange.exchangeId} exchange={exchange} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
          <p className="fine">{SETTLEMENT_NOTE}</p>
        </section>
      )}
    </div>
  )
}

function ExchangeRow({ exchange }: { exchange: AdminExchange }) {
  const blocked =
    isExchangeReviewable(exchange.status) &&
    approveBlockReason(exchange) !== null
  return (
    <tr aria-label={`환전 신청 #${exchange.exchangeId}`}>
      <td>{formatDateTime(exchange.requestedAt)}</td>
      <td>
        <span className={styles.applicant}>
          {applicantLabel(exchange)}
          {blocked && <span className="pill bad">승인 불가</span>}
        </span>
      </td>
      <td className="r num">{formatNumber(exchange.requestedAmount)}</td>
      <td className="r num">−{formatNumber(exchange.feeAmount)}</td>
      <td className="r num">
        <b>{formatNumber(exchange.expectedPayoutAmount)}</b>
      </td>
      <td>{formatSettlementDate(exchange.settlementRoundDate)} 예정</td>
      <td>
        <ExchangeStatusPill status={exchange.status} />
      </td>
      <td className="r">
        <Link className="btn sm" to={`/admin/exchanges/${exchange.exchangeId}`}>
          상세
        </Link>
      </td>
    </tr>
  )
}
