import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  REJECTION_REASON_MAX,
  upgradeReviewsQuery,
} from '@/entities/member/api'
import type {
  UpgradeRequestStatus,
  UpgradeReview,
} from '@/entities/member/types'
import { PLATFORM_LABEL } from '@/entities/member/types'
import { UpgradeStatusPill } from '@/entities/member/ui/UpgradeStatusPill'
import {
  useApproveUpgrade,
  useRejectUpgrade,
} from '@/features/upgrade/useUpgradeReview'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminPromotionsPage.module.css'

const TABS: { status: UpgradeRequestStatus; label: string; empty: string }[] = [
  { status: 'PENDING', label: '심사 대기', empty: '심사 대기 신청이 없어요' },
  { status: 'APPROVED', label: '승인', empty: '승인한 신청이 없어요' },
  { status: 'REJECTED', label: '반려', empty: '반려한 신청이 없어요' },
]

/** 자주 쓰는 반려 사유 (목업 REJECT_TEMPLATES.promo) */
const REJECT_TEMPLATES = [
  '강의 계획이 구체적이지 않아요. 목차를 더 적어 주세요',
  '최근 방송 기록이 부족해요. 한 달 뒤 다시 신청해 주세요',
]

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 심사 대기다. 바꾸면 첫 페이지로 간다. */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const status =
    TABS.find((t) => t.status === params.get('status'))?.status ?? 'PENDING'
  const setStatus = (next: UpgradeRequestStatus) => {
    const search = new URLSearchParams()
    if (next !== 'PENDING') search.set('status', next)
    setParams(search)
  }
  return [status, setStatus] as const
}

export function AdminPromotionsPage() {
  const [status, setStatus] = useStatusParam()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(upgradeReviewsQuery(status, page))
  const moving = useClampPage(page, query, setPage)
  // 머리글 건수는 탭과 관계없이 심사 대기 기준이다.
  const pending = useQuery(upgradeReviewsQuery('PENDING', 0))
  const pendingCount = pending.data?.page.totalElements
  const { data, error, isPending, refetch } = query
  const tab = TABS.find((t) => t.status === status) ?? TABS[0]

  return (
    <div className="page">
      <PageHead
        title="승급 심사"
        lede="승인하면 인증된 인플루언서가 되어 강의를 등록·판매할 수 있어요. 반려하면 사유가 신청자에게 보이고, 신청자는 보완해 다시 신청해요."
        actions={
          pendingCount !== undefined &&
          (pendingCount > 0 ? (
            <span className="pill warn">대기 {pendingCount}건</span>
          ) : (
            <span className="pill ok">모두 처리함</span>
          ))
        }
      />
      <div className="toolbar">
        <div role="group" aria-label="심사 상태" className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              className={status === t.status ? 'btn sm primary' : 'btn sm'}
              aria-pressed={status === t.status}
              onClick={() => setStatus(t.status)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title={tab.empty} />
      ) : (
        <section className="panel">
          <ul className={styles.list} aria-label="승급 신청 목록">
            {data.content.map((review) => (
              <ReviewItem key={review.requestId} review={review} />
            ))}
          </ul>
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

function ReviewItem({ review }: { review: UpgradeReview }) {
  return (
    <li className="q-item" aria-label={`${review.nickname}의 승급 신청`}>
      <div className="row-main">
        <div className={styles.head}>
          <b>{review.nickname}</b>
          <span className="fine">회원 #{review.memberId}</span>
          <UpgradeStatusPill status={review.status} />
        </div>
        <span className="fine">
          {formatDate(review.requestedAt)} 신청
          {review.reviewedAt && ` · ${formatDate(review.reviewedAt)} 처리`}
        </span>
        {review.channels.length > 0 ? (
          <div className={styles.channels}>
            {review.channels.map((c) => (
              <a
                key={c.channelUrl}
                className="pill mute"
                href={c.channelUrl}
                target="_blank"
                rel="noreferrer"
              >
                {PLATFORM_LABEL[c.platform]} · {c.channelName} · 팔로워{' '}
                {formatNumber(c.followerCount)}
              </a>
            ))}
          </div>
        ) : (
          <span className="fine c-bad">승인된 채널이 없어요</span>
        )}
        <p className={`app-note ${styles.reason}`}>{review.requestReason}</p>
        {review.rejectionReason && (
          <span className="fine c-bad">
            반려 사유: {review.rejectionReason}
          </span>
        )}
      </div>
      {review.status === 'PENDING' && <Decide requestId={review.requestId} />}
    </li>
  )
}

/** 승인 / 반려(사유 입력). 목업 Decide */
function Decide({ requestId }: { requestId: number }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const approve = useApproveUpgrade()
  const reject = useRejectUpgrade()
  const busy = approve.isPending || reject.isPending
  const trimmed = reason.trim()

  if (!rejecting)
    return (
      <div className="row-actions">
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => setRejecting(true)}
        >
          반려
        </button>
        <button
          type="button"
          className="btn primary sm"
          disabled={busy}
          onClick={() => approve.mutate(requestId)}
        >
          승인
        </button>
      </div>
    )
  return (
    <div className={styles.rejectBox}>
      <div className="tpl-chips">
        <span className="fine">자주 쓰는 사유</span>
        {REJECT_TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            className={reason === t ? 'chip sm on' : 'chip sm'}
            aria-pressed={reason === t}
            onClick={() => setReason(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <input
        className="input"
        value={reason}
        maxLength={REJECTION_REASON_MAX}
        onChange={(e) => setReason(e.target.value)}
        placeholder="사유 (신청자에게 보여요)"
        aria-label="반려 사유"
      />
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setRejecting(false)}
      >
        취소
      </button>
      <button
        type="button"
        className="btn danger sm"
        disabled={!trimmed || busy}
        onClick={() => reject.mutate({ requestId, reason: trimmed })}
      >
        반려
      </button>
    </div>
  )
}
