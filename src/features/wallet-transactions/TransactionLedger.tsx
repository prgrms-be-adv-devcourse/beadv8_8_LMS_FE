import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { transactionsQuery } from '@/entities/wallet/api'
import {
  changedBuckets,
  formatSignedHp,
  transactionLink,
} from '@/entities/wallet/transaction'
import type { WalletTransaction } from '@/entities/wallet/types'
import { formatDateTime } from '@/shared/lib/date'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/** 지갑의 HP 거래 원장(최신 거래부터). 페이지는 ?txPage=N(1부터)에 둔다. */
export function TransactionLedger() {
  const [page, setPage] = usePageParam('txPage')
  const query = useQuery(transactionsQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)

  return (
    <section className="panel" aria-labelledby="transaction-ledger">
      <h2 id="transaction-ledger">거래 원장</h2>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={() => void refetch()} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 HP 거래가 없어요" />
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl ledger">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>내용</th>
                  <th>HP 종류</th>
                  <th className="r">증감</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((tx) => (
                  <TransactionRow key={tx.transactionId} tx={tx} />
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
            원장은 지우거나 고치지 않아요. 정정이 필요하면 반대 거래를 한 줄 더
            남겨요.
          </p>
        </>
      )}
    </section>
  )
}

const BUCKET = {
  charge: ['charge', '충전'],
  revenue: ['earn', '수익'],
} as const

/** 증감은 가용 HP 변화가 기본이고, 보류 HP 변화는 아래 줄에 따로 쓴다(BE 값 그대로). */
function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const link = transactionLink(tx)
  const available = tx.availableChangeHp
  const held = tx.heldChangeHp
  return (
    <tr>
      <td className="num muted">{formatDateTime(tx.occurredAt)}</td>
      <td>
        {tx.displayName}
        {link && (
          <>
            {' '}
            <Link className="link fine" to={link.to}>
              {link.label}
            </Link>
          </>
        )}
      </td>
      <td>
        {changedBuckets(tx).map((bucket) => (
          <span key={bucket}>
            <i className={`dot ${BUCKET[bucket][0]}`} />
            {BUCKET[bucket][1]}{' '}
          </span>
        ))}
      </td>
      <td className="r num">
        {available !== 0 && (
          <div className={available > 0 ? 'amt-p' : 'amt-m'}>
            {formatSignedHp(available)}
          </div>
        )}
        {held !== 0 && (
          <div className={available === 0 ? 'muted' : 'fine'}>
            보류 {formatSignedHp(held)}
          </div>
        )}
        {available === 0 && held === 0 && <span className="muted">0</span>}
      </td>
    </tr>
  )
}
