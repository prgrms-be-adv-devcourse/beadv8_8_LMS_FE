import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { exchangesQuery } from '@/entities/wallet/api'
import {
  SETTLEMENT_NOTE,
  formatSettlementDate,
} from '@/entities/wallet/exchange'
import type { Exchange } from '@/entities/wallet/types'
import { ExchangeStatusPill } from '@/entities/wallet/ui/ExchangeStatusPill'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { ExchangeDetailModal } from './ExchangeDetailModal'

/** 지갑의 환전 내역(최신 신청부터). 페이지는 ?exchangePage=N(1부터)에 둔다. */
export function ExchangeHistory() {
  const [page, setPage] = usePageParam('exchangePage')
  const query = useQuery(exchangesQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <section className="panel" aria-labelledby="exchange-history">
      <h2 id="exchange-history">환전 내역</h2>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={() => void refetch()} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 환전 신청 내역이 없어요" />
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl exch">
              <thead>
                <tr>
                  <th>신청일</th>
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
                  <ExchangeRow
                    key={exchange.exchangeId}
                    exchange={exchange}
                    onOpen={() => setOpenId(exchange.exchangeId)}
                  />
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
        </>
      )}
      {openId !== null && (
        <ExchangeDetailModal
          exchangeId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  )
}

function ExchangeRow({
  exchange,
  onOpen,
}: {
  exchange: Exchange
  onOpen: () => void
}) {
  return (
    <tr>
      <td>{formatDate(exchange.requestedAt)}</td>
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
        <button type="button" className="btn sm" onClick={onOpen}>
          상세
        </button>
      </td>
    </tr>
  )
}
