import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { transactionsQuery } from '@/entities/wallet/api'
import {
  changedBuckets,
  formatSignedHp,
  transactionLink,
} from '@/entities/wallet/transaction'
import type { WalletTransaction } from '@/entities/wallet/types'
import { RowsSkeleton } from '@/entities/wallet/ui/RowsSkeleton'
import { formatDate, formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Pager } from '@/shared/ui/Pager'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './TransactionLedger.module.css'

/** 지갑의 HP 거래 원장(최신 거래부터). 페이지는 ?txPage=N(1부터)에 둔다. */
export function TransactionLedger() {
  const [page, setPage] = usePageParam('txPage')
  const query = useQuery(transactionsQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)

  return (
    <section className="panel" aria-labelledby="transaction-ledger">
      <div className={styles.head}>
        <h2 id="transaction-ledger">거래 원장</h2>
        {data && data.page.totalElements > 0 && (
          <span className={styles.count}>
            총 {formatNumber(data.page.totalElements)}건
          </span>
        )}
      </div>
      {isPending || moving ? (
        <RowsSkeleton />
      ) : error ? (
        <LoadError error={error} retry={() => void refetch()} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 HP 거래가 없어요">
          HP를 충전하거나 강의를 사면 거래가 여기에 한 줄씩 남아요.
        </EmptyState>
      ) : (
        <>
          <div className="tbl-wrap">
            <table
              className={`tbl ledger ${styles.table}`}
              aria-label="거래 내역"
            >
              <thead>
                <tr>
                  <th scope="col">일시</th>
                  <th scope="col">내용</th>
                  <th scope="col">HP 종류</th>
                  <th className="r" scope="col">
                    증감
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((tx, i) => (
                  <TransactionRow
                    key={tx.transactionId}
                    tx={tx}
                    sameDay={
                      i > 0 &&
                      formatDate(data.content[i - 1].occurredAt) ===
                        formatDate(tx.occurredAt)
                    }
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
          <p className={`fine ${styles.note}`}>
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

/**
 * 증감은 가용 HP 변화가 기본이고, 보류 HP 변화는 아래 줄에 따로 쓴다(BE 값 그대로).
 * 앞 거래와 같은 날이면 날짜를 흐리게 해 하루 단위로 묶여 읽히게 한다.
 */
function TransactionRow({
  tx,
  sameDay,
}: {
  tx: WalletTransaction
  sameDay: boolean
}) {
  const link = transactionLink(tx)
  const available = tx.availableChangeHp
  const held = tx.heldChangeHp
  const day = formatDate(tx.occurredAt)
  const time = formatDateTime(tx.occurredAt).slice(day.length + 1)
  return (
    <tr className={sameDay ? styles.sameDay : styles.newDay}>
      <td className={`num muted ${styles.when}`}>
        <span className={styles.day}>{day}</span>{' '}
        <span className={styles.time}>{time}</span>
      </td>
      <td className={styles.what}>
        {tx.displayName}
        {link && (
          <>
            {' '}
            <Link className={`link fine ${styles.link}`} to={link.to}>
              {link.label}
            </Link>
          </>
        )}
      </td>
      <td>
        <span className={styles.kinds}>
          {changedBuckets(tx).map((bucket) => (
            <span
              key={bucket}
              className={`${styles.kind} ${styles[BUCKET[bucket][0]]}`}
            >
              <i className={`dot ${BUCKET[bucket][0]}`} aria-hidden="true" />
              {BUCKET[bucket][1]}
            </span>
          ))}
        </span>
      </td>
      <td className={`r num ${styles.delta}`}>
        {available !== 0 && (
          <div className={available > 0 ? 'amt-p' : 'amt-m'}>
            {formatSignedHp(available)}
          </div>
        )}
        {held !== 0 && (
          <div className={available === 0 ? 'muted' : `fine ${styles.held}`}>
            보류 {formatSignedHp(held)}
          </div>
        )}
        {available === 0 && held === 0 && <span className="muted">0</span>}
      </td>
    </tr>
  )
}
