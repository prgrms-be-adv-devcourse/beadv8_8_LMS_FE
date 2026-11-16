import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  feeIncomesQuery,
  platformWalletQuery,
} from '@/entities/wallet/platformWalletApi'
import type { FeeIncome } from '@/entities/wallet/types'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function AdminPlatformWalletPage() {
  return (
    <div className="page">
      <PageHead
        title="수수료 수입"
        lede="환전 송금이 성공하면 그 환전의 수수료가 플랫폼 지갑에 쌓여요. 최종 실패·취소·거절된 환전은 들어가지 않아요."
      />
      <Balance />
      <History />
    </div>
  )
}

function Balance() {
  const { data, error, isPending, refetch } = useQuery(platformWalletQuery())
  if (isPending) return <Loading />
  if (error) return <LoadError error={error} retry={refetch} />
  return (
    <section className="bal" aria-label="수수료 수입 잔액">
      <div className="lbl">
        <span>수수료 수입 잔액</span>
      </div>
      <div className="amt">
        {formatNumber(data.feeIncomeBalance)}
        <small>HP</small>
      </div>
      <p className="desc">송금 완료된 환전의 수수료를 합친 금액이에요.</p>
    </section>
  )
}

function History() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(feeIncomesQuery(page))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  if (isPending || moving) return <Loading />
  if (error) return <LoadError error={error} retry={refetch} />
  if (data.content.length === 0)
    return (
      <EmptyState title="수수료 수입 내역이 없어요">
        환전 송금이 성공하면 여기에 쌓여요.
      </EmptyState>
    )
  return (
    <section className="panel">
      <div className="tbl-wrap">
        <table className="tbl" aria-label="수수료 수입 내역">
          <thead>
            <tr>
              <th>기록 일시</th>
              <th>환전</th>
              <th className="r">신청 금액(HP)</th>
              <th className="r">수수료(HP)</th>
              <th className="r">송금액(원)</th>
            </tr>
          </thead>
          <tbody>
            {data.content.map((income) => (
              <FeeIncomeRow key={income.ledgerId} income={income} />
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        page={data.page.number}
        totalPages={data.page.totalPages}
        onChange={setPage}
      />
      <p className="fine">
        신청 금액은 송금액과 수수료를 합친 수익 HP예요. 송금액은 원 단위예요.
      </p>
    </section>
  )
}

function FeeIncomeRow({ income }: { income: FeeIncome }) {
  return (
    <tr aria-label={`환전 #${income.exchangeId} 수수료`}>
      <td>{formatDateTime(income.recordedAt)}</td>
      <td>
        <Link className="link" to={`/admin/exchanges/${income.exchangeId}`}>
          환전 #{income.exchangeId}
        </Link>
      </td>
      <td className="r num">{formatNumber(income.requestedAmount)}</td>
      <td className="r num">
        <b>{formatNumber(income.feeAmount)}</b>
      </td>
      <td className="r num">{formatNumber(income.payoutAmount)}</td>
    </tr>
  )
}
