import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { adminExchangeQuery } from '@/entities/wallet/adminExchangeApi'
import {
  APPLICANT_STATUS_LABEL,
  approveBlockReason,
  isExchangeReviewable,
} from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { ExchangeStatusPill } from '@/entities/wallet/ui/ExchangeStatusPill'
import { ApproveExchangeModal } from '@/features/exchange-review/ApproveExchangeModal'
import { RejectExchangeModal } from '@/features/exchange-review/RejectExchangeModal'
import { useReviewingExchange } from '@/features/exchange-review/useExchangeReview'
import { ExchangeSummary } from '@/features/wallet-exchange/ExchangeSummary'
import { VIEWER_LABEL } from '@/shared/auth/role'
import { formatDateTime } from '@/shared/lib/date'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminExchangePage.module.css'

const back = (
  <Link className="back" to="/admin/exchanges">
    ← 환전 승인
  </Link>
)

export function AdminExchangePage() {
  const exchangeId = Number(useParams().exchangeId)
  const { data, error, isPending, refetch } = useQuery(
    adminExchangeQuery(exchangeId),
  )

  if (isPending)
    return (
      <div className="page">
        {back}
        <Loading />
      </div>
    )
  if (error)
    return (
      <div className="page">
        {back}
        <LoadError error={error} retry={refetch} />
      </div>
    )
  return <Detail key={exchangeId} exchange={data} />
}

function Detail({ exchange }: { exchange: AdminExchange }) {
  const { applicant } = exchange
  const reviewed = exchange.approvedAt !== null || exchange.rejectedAt !== null

  return (
    <div className="page">
      {back}
      <PageHead
        title={`환전 신청 #${exchange.exchangeId}`}
        actions={<ExchangeStatusPill status={exchange.status} />}
      />
      <div className="split">
        <div className="page" style={{ gap: 16 }}>
          <section className="panel" aria-labelledby="exchange-summary">
            <h2 id="exchange-summary">신청 내용</h2>
            <ExchangeSummary exchange={exchange} />
          </section>
          <section className="panel" aria-labelledby="exchange-applicant">
            <h2 id="exchange-applicant">신청자</h2>
            <dl className="kv">
              <dt>회원</dt>
              <dd>
                {applicant ? `${applicant.nickname} · ` : ''}회원 #
                {exchange.userId}
              </dd>
              {applicant ? (
                <>
                  <dt>역할</dt>
                  <dd>{VIEWER_LABEL[applicant.role]}</dd>
                  <dt>회원 상태</dt>
                  <dd>{APPLICANT_STATUS_LABEL[applicant.status]}</dd>
                </>
              ) : (
                <>
                  <dt>회원 정보</dt>
                  <dd>정보 동기화 전</dd>
                </>
              )}
            </dl>
            <p className="fine">신청 당시가 아니라 지금 회원 정보예요.</p>
          </section>
          {reviewed && (
            <section className="panel" aria-labelledby="exchange-history">
              <h2 id="exchange-history">처리 기록</h2>
              <dl className="kv">
                {exchange.approvedAt && (
                  <>
                    <dt>승인</dt>
                    <dd>
                      {formatDateTime(exchange.approvedAt)} · 관리자 #
                      {exchange.approvedBy}
                    </dd>
                  </>
                )}
                {exchange.rejectedAt && (
                  <>
                    <dt>거절</dt>
                    <dd>
                      {formatDateTime(exchange.rejectedAt)} · 관리자 #
                      {exchange.rejectedBy}
                    </dd>
                    <dt>거절 사유</dt>
                    <dd className={styles.reason}>
                      {exchange.rejectionReason}
                    </dd>
                  </>
                )}
              </dl>
            </section>
          )}
        </div>
        {isExchangeReviewable(exchange.status) && (
          <Decide exchange={exchange} />
        )}
      </div>
    </div>
  )
}

/**
 * 승인 / 거절. 처리하면 상세가 응답 값으로 바뀌고(승인 대기가 아니게 되어) 이 영역과 모달이 사라진다.
 * 409로 다시 불러온 값이 승인할 수 없는 신청이면 승인 모달도 닫힌다.
 */
function Decide({ exchange }: { exchange: AdminExchange }) {
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null)
  const busy = useReviewingExchange()
  const blocked = approveBlockReason(exchange)

  return (
    <section className="panel sticky" aria-labelledby="exchange-decide">
      <h2 id="exchange-decide">처리</h2>
      {blocked ? (
        <div className="notice bad">{blocked}</div>
      ) : (
        <p className="fine">
          승인하면 송금 대기로 바뀌고, 거절하면 보류한 수익 HP를 신청자에게
          돌려줘요.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => setOpen('reject')}
        >
          거절
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy || blocked !== null}
          onClick={() => setOpen('approve')}
        >
          승인
        </button>
      </div>
      {open === 'approve' && !blocked && (
        <ApproveExchangeModal
          exchange={exchange}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'reject' && (
        <RejectExchangeModal
          exchange={exchange}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
