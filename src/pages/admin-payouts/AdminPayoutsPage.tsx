import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { payoutFailuresQuery } from '@/entities/payout/api'
import { payoutFailureLabel } from '@/entities/payout/failureCode'
import type { PayoutFailure } from '@/entities/payout/types'
import {
  isFinalReleaseError,
  useReleasePayout,
  useReleasingPayout,
} from '@/features/payout-admin/useReleasePayout'
import { formatDate, formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminPayoutsPage.module.css'

export function AdminPayoutsPage() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(payoutFailuresQuery(page))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query
  const [releasing, setReleasing] = useState<PayoutFailure | null>(null)
  const release = useReleasePayout()
  // 모달을 닫았다 열거나 화면을 다시 열어도, 진행 중인 해제 요청이 있으면 다시 보내지 못한다.
  const busy = useReleasingPayout()

  return (
    <div className="page">
      <PageHead
        title="지급 실패"
        lede="강의 판매 대금 지급 배치(매일 01:00)에서 실패한 항목이에요. 격리된 항목은 원인을 고친 뒤 해제해야 다음 배치에서 다시 지급을 시도해요."
      />
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title="지급에 실패한 항목이 없어요" />
      ) : (
        <section className="panel">
          <ul className={styles.list} aria-label="지급 실패 목록">
            {data.content.map((failure) => (
              <FailureItem
                key={failure.orderItemId}
                failure={failure}
                busy={busy}
                onRelease={() => setReleasing(failure)}
              />
            ))}
          </ul>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </section>
      )}
      {releasing && (
        <Modal
          title="격리를 해제할까요?"
          onClose={() => setReleasing(null)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setReleasing(null)}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  release.mutate(releasing.orderItemId, {
                    onSuccess: () => setReleasing(null),
                    onError: (e) => {
                      if (isFinalReleaseError(e)) setReleasing(null)
                    },
                  })
                }
              >
                격리 해제
              </button>
            </>
          }
        >
          <p>
            주문 #{releasing.orderId} · 항목 #{releasing.orderItemId} (
            {formatNumber(releasing.priceHp)} HP)
          </p>
          <p>
            원인을 먼저 고친 뒤 해제하세요. 바로 지급되지 않고 다음 지급
            배치(매일 01:00)에서 다시 시도해요. 원인이 그대로면 다시 격리돼요.
          </p>
          <p className="fine">
            마지막 실패: {payoutFailureLabel(releasing.lastPayoutFailureCode)}
          </p>
        </Modal>
      )}
    </div>
  )
}

function FailureItem({
  failure,
  busy,
  onRelease,
}: {
  failure: PayoutFailure
  busy: boolean
  onRelease: () => void
}) {
  const quarantined = failure.payoutQuarantinedAt !== null
  return (
    <li
      className="q-item"
      aria-label={`주문 항목 ${failure.orderItemId}의 지급 실패`}
    >
      <div className="row-main">
        <div className={styles.head}>
          {quarantined ? (
            <span className="pill bad">격리됨</span>
          ) : (
            <span className="pill warn">자동 재시도 대기</span>
          )}
          <b>
            주문 #{failure.orderId} · 항목 #{failure.orderItemId}
          </b>
          <Link className="link" to={`/admin/lectures/${failure.lectureId}`}>
            강의 #{failure.lectureId}
          </Link>
        </div>
        <span className="fine">
          판매자 회원 #{failure.sellerUserId} · 구매자 회원 #
          {failure.buyerUserId} · {formatNumber(failure.priceHp)} HP ·{' '}
          {formatDate(failure.payoutScheduledAt)} 지급 예정
        </span>
        <span className={`fine ${styles.code}`}>
          실패 {failure.payoutFailureCount}회 · 마지막{' '}
          {formatDateTime(failure.lastPayoutFailedAt)} ·{' '}
          {payoutFailureLabel(failure.lastPayoutFailureCode)}
        </span>
        {quarantined && (
          <span className="fine c-bad">
            {formatDateTime(failure.payoutQuarantinedAt!)} 격리 — 지급 배치가
            처리하지 않아요
          </span>
        )}
      </div>
      {quarantined && (
        <div className="row-actions">
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={onRelease}
          >
            격리 해제
          </button>
        </div>
      )}
    </li>
  )
}
