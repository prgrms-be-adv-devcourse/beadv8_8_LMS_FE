import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { adminExchangePayoutsOfQuery } from '@/entities/wallet/adminExchangeApi'
import {
  isPayoutCheckable,
  isPayoutDecidable,
  latestPayout,
} from '@/entities/wallet/exchangePayout'
import type {
  AdminExchange,
  AdminExchangePayout,
} from '@/entities/wallet/types'
import { ExchangePayoutStatusPill } from '@/entities/wallet/ui/ExchangePayoutStatusPill'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './ExchangePayoutPanel.module.css'
import { FinalFailureModal } from './FinalFailureModal'
import { RetryPayoutModal } from './RetryPayoutModal'
import { usePayoutBusy, useRecheckPayout } from './useExchangePayout'

/**
 * 관리자 환전 상세의 송금 시도 이력과 처리. 마지막 시도·환전 상태에 맞는 버튼만 보인다.
 * 결과가 확정되지 않은 마지막 시도 → 결과 재확인, 송금이 확정 실패한 환전 → 재송금·최종 실패 확정.
 */
export function ExchangePayoutPanel({ exchange }: { exchange: AdminExchange }) {
  const { data, error, isPending, refetch } = useQuery(
    adminExchangePayoutsOfQuery(exchange.exchangeId),
  )

  return (
    <section className="panel" aria-labelledby="exchange-payouts">
      <h2 id="exchange-payouts">송금 시도</h2>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.length === 0 ? (
        <p className="fine">
          아직 송금 시도가 없어요. 승인한 환전은 정산 예정일이 지난 뒤 정산
          처리에서 송금해요.
        </p>
      ) : (
        <>
          <AttemptTable attempts={data} />
          <Actions exchange={exchange} latest={latestPayout(data)} />
        </>
      )}
    </section>
  )
}

function AttemptTable({ attempts }: { attempts: AdminExchangePayout[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl" aria-label="송금 시도 이력">
        <thead>
          <tr>
            <th>시도</th>
            <th>상태</th>
            <th className="r">송금액(원)</th>
            <th>요청</th>
            <th>결과</th>
            <th>결과 확인</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => (
            <AttemptRow key={attempt.payoutId} attempt={attempt} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AttemptRow({ attempt }: { attempt: AdminExchangePayout }) {
  return (
    <tr aria-label={`송금 시도 ${attempt.attemptNo}`}>
      <td className="num">#{attempt.attemptNo}</td>
      <td>
        <ExchangePayoutStatusPill status={attempt.status} />
      </td>
      <td className="r num">{formatNumber(attempt.amountKrw)}</td>
      <td>
        <span className={styles.cell}>
          <span>{formatDateTime(attempt.requestedAt)}</span>
          <span className="fine">
            {attempt.requestedBy !== null
              ? `관리자 #${attempt.requestedBy} 재송금`
              : '자동 송금'}
          </span>
          <span className={`fine ${styles.code}`}>
            요청 ID {attempt.payoutRequestId}
          </span>
        </span>
      </td>
      <td>
        <span className={styles.cell}>
          {attempt.completedAt && (
            <span>{formatDateTime(attempt.completedAt)} 성공</span>
          )}
          {attempt.transactionId && (
            <span className={`fine ${styles.code}`}>
              거래 번호 {attempt.transactionId}
            </span>
          )}
          {attempt.failedAt && (
            <span>{formatDateTime(attempt.failedAt)} 실패</span>
          )}
          {attempt.manualReviewAt && (
            <span className="fine">
              {formatDateTime(attempt.manualReviewAt)} 운영자 확인으로 넘김
            </span>
          )}
          {attempt.failureReason && (
            <span className={`fine ${styles.code}`}>
              사유 {attempt.failureReason}
            </span>
          )}
        </span>
      </td>
      <td>
        <span className={styles.cell}>
          <span className="fine">
            자동 확인 {formatNumber(attempt.resultCheckCount)}회
            {attempt.lastCheckedAt &&
              ` · 마지막 ${formatDateTime(attempt.lastCheckedAt)}`}
          </span>
          {attempt.manualCheckedAt && (
            <span className="fine">
              관리자
              {attempt.manualCheckedBy !== null &&
                ` #${attempt.manualCheckedBy}`}{' '}
              재확인 {formatDateTime(attempt.manualCheckedAt)}
            </span>
          )}
        </span>
      </td>
    </tr>
  )
}

/**
 * 마지막 시도와 환전 상태에 맞는 처리. 재송금·최종 실패는 되돌릴 수 없어 확인 창을 거친다.
 * 처리하면 상세와 시도 이력을 다시 불러와 맞지 않게 된 버튼과 모달은 사라진다.
 */
function Actions({
  exchange,
  latest,
}: {
  exchange: AdminExchange
  latest: AdminExchangePayout | null
}) {
  const [open, setOpen] = useState<'retry' | 'final' | null>(null)
  const busy = usePayoutBusy(exchange.exchangeId)
  const recheck = useRecheckPayout(exchange.exchangeId)
  const checkable = latest !== null && isPayoutCheckable(latest.status)
  const decidable = isPayoutDecidable(exchange.status)
  if (!checkable && !decidable) return null

  return (
    <div className={styles.decide}>
      {checkable && (
        <p className="fine">
          마지막 송금의 결과가 확정되지 않았어요. 결과 재확인은 같은 지급 요청
          ID로 은행에 결과만 물어보고 새로 보내지 않아요.
        </p>
      )}
      {decidable && (
        <p className="fine">
          은행이 송금 실패를 확정했어요. 보류한 수익 HP는 그대로예요. 다시
          송금하거나, 최종 실패로 끝내 신청자에게 돌려줄 수 있어요.
        </p>
      )}
      <div className={styles.actions}>
        {checkable && (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            aria-busy={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            {recheck.isPending ? '확인 중…' : '결과 재확인'}
          </button>
        )}
        {decidable && (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setOpen('final')}
            >
              최종 실패 확정
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => setOpen('retry')}
            >
              재송금
            </button>
          </>
        )}
      </div>
      {decidable && open === 'retry' && (
        <RetryPayoutModal exchange={exchange} onClose={() => setOpen(null)} />
      )}
      {decidable && open === 'final' && (
        <FinalFailureModal exchange={exchange} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
