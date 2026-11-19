import { useQuery } from '@tanstack/react-query'
import { earningSummaryQuery, earningsQuery } from '@/entities/wallet/api'
import {
  EARNING_FILTERS,
  EARNING_FILTER_PARAM,
  EARNING_SUMMARY_ROWS,
  EARNING_TYPE_LABEL,
  parseEarningFilter,
  type EarningFilter,
} from '@/entities/wallet/earning'
import type { EarningAmount, EarningSummary } from '@/entities/wallet/types'
import { EarningStatusPill } from '@/entities/wallet/ui/EarningStatusPill'
import { RowsSkeleton } from '@/entities/wallet/ui/RowsSkeleton'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Pager } from '@/shared/ui/Pager'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './EarningsPanel.module.css'

const PAGE_PARAM = 'earningPage'

const EMPTY: Record<EarningFilter, string> = {
  unpaid: '지급 예정인 수익이 없어요',
  completed: '지급 완료된 수익이 없어요',
  canceled: '취소된 수익이 없어요',
}

/**
 * 인플루언서 지갑의 지급 예정 수익: 상태별 합계(요약)와 강의 판매·출연 수익 목록.
 * 상태 필터는 ?earning=completed|canceled(없으면 미지급), 페이지는 ?earningPage=N(1부터)에 둔다.
 * 요약을 불러오지 못하면(출처 장애 503 등) 이 패널만 오류로 보여 준다. 목록만 실패하면 목록 자리에 보여 준다.
 */
export function EarningsPanel() {
  const [params, merge] = useMergedSearchParams()
  const filter = parseEarningFilter(params.get(EARNING_FILTER_PARAM))
  const [page, setPage] = usePageParam(PAGE_PARAM)
  const summary = useQuery(earningSummaryQuery)
  const list = useQuery(earningsQuery(filter, page))
  const moving = useClampPage(page, list, setPage)

  const setFilter = (next: EarningFilter) =>
    merge((params) => {
      if (next === 'unpaid') params.delete(EARNING_FILTER_PARAM)
      else params.set(EARNING_FILTER_PARAM, next)
      params.delete(PAGE_PARAM)
      return params
    })

  const listError = (!list.data && list.error) || null
  // 출처 장애면 요약·목록이 함께 실패한다. 다시 시도 하나로 둘 다 다시 부른다.
  const retryAll = () => {
    void summary.refetch()
    if (listError) void list.refetch()
  }

  return (
    <section className="panel" aria-labelledby="earnings-heading">
      <h2 id="earnings-heading">지급 예정 수익</h2>
      {!summary.data && summary.error ? (
        <LoadError error={summary.error} retry={retryAll} />
      ) : !summary.data ? (
        <RowsSkeleton rows={2} />
      ) : (
        <>
          <SummaryList summary={summary.data} />
          <p className={`fine ${styles.asOf}`}>
            {formatDateTime(summary.data.asOf)} 기준
          </p>
          <div className={`toolbar ${styles.toolbar}`}>
            <div
              role="group"
              aria-label="수익 상태"
              className={`amt-chips ${styles.filters}`}
            >
              {EARNING_FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'chip on' : 'chip'}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {listError ? (
            <LoadError error={listError} retry={() => void list.refetch()} />
          ) : !list.data || moving ? (
            <RowsSkeleton rows={3} />
          ) : list.data.content.length === 0 ? (
            <EmptyState title={EMPTY[filter]} />
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="tbl" aria-label="수익 내역">
                  <thead>
                    <tr>
                      <th scope="col">출처</th>
                      <th scope="col">내용</th>
                      <th className="r" scope="col">
                        금액(HP)
                      </th>
                      <th scope="col">상태</th>
                      <th scope="col">지급 예정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.content.map((item) => (
                      <tr
                        key={`${item.sourceType}-${item.sourceId}-${item.earningType}`}
                      >
                        <td>
                          {lookup(EARNING_TYPE_LABEL, item.earningType) ??
                            UNKNOWN_NAME}
                        </td>
                        <td>{item.title}</td>
                        <td className={`r num c-earn ${styles.amount}`}>
                          {formatNumber(item.amountHp)}
                        </td>
                        <td>
                          <EarningStatusPill status={item.status} />
                        </td>
                        <td className="num">
                          {item.payoutScheduledAt
                            ? formatDateTime(item.payoutScheduledAt)
                            : '미정'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={list.data.page.number}
                totalPages={list.data.page.totalPages}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}

/** 금액·건수. 글자는 "12,000 HP · 1건" 그대로 읽히고, 금액만 크게 보인다. */
function Amount({ value }: { value: EarningAmount }) {
  return (
    <span className={styles.value}>
      <b className="num">{formatNumber(value.amountHp)}</b> HP ·{' '}
      <span className="num">{formatNumber(value.count)}</span>건
    </span>
  )
}

/** 아직 지급하지 않은 수익의 합계와 상태별 금액·건수(BE 값 그대로). 합계를 맨 앞 큰 칸에 둔다. */
function SummaryList({ summary }: { summary: EarningSummary }) {
  return (
    <ul className={styles.stats} aria-label="수익 요약">
      <li className={`${styles.stat} ${styles.total}`}>
        <span className={styles.label}>
          <i className="dot earn" aria-hidden="true" />
          합계
        </span>
        <Amount value={summary.total} />
      </li>
      {EARNING_SUMMARY_ROWS.map(([key, label]) => (
        <li key={key} className={styles.stat}>
          <span className={styles.label}>{label}</span>
          <Amount value={summary[key]} />
        </li>
      ))}
    </ul>
  )
}
