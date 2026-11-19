import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  adminExchangePayoutsQuery,
  adminExchangesQuery,
} from '@/entities/wallet/adminExchangeApi'
import {
  ADMIN_PAYOUT_FILTERS,
  type AdminPayoutFilter,
} from '@/entities/wallet/exchangePayout'
import type { AdminExchangePayout } from '@/entities/wallet/types'
import { ExchangePayoutStatusPill } from '@/entities/wallet/ui/ExchangePayoutStatusPill'
import { ExchangeStatusPill } from '@/entities/wallet/ui/ExchangeStatusPill'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminExchangePayoutsPage.module.css'
import admin from '@/pages/admin-shared.module.css'

const DEFAULT_STATUS: AdminPayoutFilter = 'MANUAL_REVIEW_REQUIRED'

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 운영자 확인이다. 바꾸면 첫 페이지로 간다. */
function useStatusParam() {
  const [params, merge] = useMergedSearchParams()
  const filter =
    ADMIN_PAYOUT_FILTERS.find((f) => f.status === params.get('status')) ??
    ADMIN_PAYOUT_FILTERS[0]
  const setStatus = (next: AdminPayoutFilter) => {
    const search = new URLSearchParams()
    if (next !== DEFAULT_STATUS) search.set('status', next)
    merge(() => search)
  }
  return [filter, setStatus] as const
}

export function AdminExchangePayoutsPage() {
  const [filter, setStatus] = useStatusParam()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(adminExchangePayoutsQuery(filter.status, page))
  const moving = useClampPage(page, query, setPage)
  // 머리글 건수는 필터와 관계없이 운영자 확인 기준이다(대시보드 카드와 같은 쿼리).
  const review = useQuery(adminExchangePayoutsQuery(DEFAULT_STATUS, 0))
  const reviewCount = review.data?.page.totalElements
  const { data, error, isPending, refetch } = query

  return (
    <div className="page">
      <PageHead
        title="송금 확인"
        lede="결과가 확정되지 않은 환전 송금이에요. 자동으로 처리할 수 없는 송금은 자동 처리가 멈추고 운영자 확인으로 넘어가요(보류 HP는 그대로예요). 환전 상세에서 결과를 다시 확인하세요."
        actions={
          reviewCount !== undefined &&
          (reviewCount > 0 ? (
            <span className="pill warn">
              확인 필요 {formatNumber(reviewCount)}건
            </span>
          ) : (
            <span className="pill ok">운영자 확인 대상 없음</span>
          ))
        }
      />
      <div className={`toolbar ${admin.toolbar}`}>
        <div
          role="group"
          aria-label="송금 상태"
          className={`${styles.filters} ${admin.seg}`}
        >
          {ADMIN_PAYOUT_FILTERS.map((f) => (
            <button
              key={f.status}
              type="button"
              className="btn sm"
              aria-pressed={filter.status === f.status}
              onClick={() => setStatus(f.status)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <FailedExchanges />
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title={filter.empty} />
      ) : (
        <section className={`panel ${admin.tablePanel}`}>
          <div className={`tbl-wrap ${admin.tableWrap}`}>
            <table className="tbl" aria-label="송금 시도 목록">
              <thead>
                <tr>
                  <th scope="col">송금 요청 일시</th>
                  <th scope="col">환전</th>
                  <th scope="col" className="r">
                    송금액(원)
                  </th>
                  <th scope="col">사유</th>
                  <th scope="col">시도 상태</th>
                  <th scope="col">환전 상태</th>
                  <th scope="col" aria-label="상세" />
                </tr>
              </thead>
              <tbody>
                {data.content.map((attempt) => (
                  <PayoutRow key={attempt.payoutId} attempt={attempt} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </section>
      )}
    </div>
  )
}

/**
 * 송금이 확정 실패해 관리자 판단(재송금·최종 실패 확정)을 기다리는 환전. 시도가 아니라 환전 단위라 환전 목록의 송금 실패에서 처리한다.
 * 목록 상태와 관계없이 늘 보인다. 건수는 환전 목록·대시보드 카드와 같은 쿼리다.
 */
function FailedExchanges() {
  const { data } = useQuery(adminExchangesQuery('FAILED', 0))
  const count = data?.page.totalElements ?? 0
  const link = (
    <Link className="link" to="/admin/exchanges?status=FAILED">
      환전 승인의 송금 실패
    </Link>
  )
  if (count > 0)
    return (
      <div className="notice warn" role="note" aria-label="판단 대기 환전">
        송금이 확정 실패해 판단을 기다리는 환전이 {formatNumber(count)}건
        있어요. {link}에서 다시 송금하거나 최종 실패로 끝내요.
      </div>
    )
  return (
    <p className="fine" role="note" aria-label="판단 대기 환전">
      송금이 확정 실패한 환전은 {link}에서 다시 송금하거나 최종 실패로 끝내요.
    </p>
  )
}

function PayoutRow({ attempt }: { attempt: AdminExchangePayout }) {
  return (
    <tr
      aria-label={`환전 #${attempt.exchangeId} 송금 시도 ${attempt.attemptNo}`}
    >
      <td>{formatDateTime(attempt.requestedAt)}</td>
      <td>
        <span className={styles.cell}>
          <span>환전 #{attempt.exchangeId}</span>
          <span className="fine">
            시도 #{attempt.attemptNo}
            {attempt.requestedBy !== null &&
              ` · 관리자 #${attempt.requestedBy} 재송금`}
          </span>
        </span>
      </td>
      <td className="r num">{formatNumber(attempt.amountKrw)}</td>
      <td>
        <span className={styles.cell}>
          {attempt.failureReason && (
            <span className={styles.code}>{attempt.failureReason}</span>
          )}
          {attempt.manualReviewAt && (
            <span className="fine">
              {formatDateTime(attempt.manualReviewAt)} 운영자 확인으로 넘김
            </span>
          )}
          {attempt.manualCheckedAt && (
            <span className="fine">
              {formatDateTime(attempt.manualCheckedAt)} 관리자 재확인
            </span>
          )}
        </span>
      </td>
      <td>
        <ExchangePayoutStatusPill status={attempt.status} />
      </td>
      <td>
        <ExchangeStatusPill status={attempt.exchangeStatus} />
      </td>
      <td className="r">
        <Link className="btn sm" to={`/admin/exchanges/${attempt.exchangeId}`}>
          상세
        </Link>
      </td>
    </tr>
  )
}
