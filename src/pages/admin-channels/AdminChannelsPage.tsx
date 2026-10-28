import { useQuery, type UseMutationResult } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  channelReviewsQuery,
  REJECTION_REASON_MAX,
} from '@/entities/member/api'
import type {
  ChannelReview,
  ChannelReviewStatus,
} from '@/entities/member/types'
import { PLATFORM_LABEL } from '@/entities/member/types'
import { UpgradeStatusPill } from '@/entities/member/ui/UpgradeStatusPill'
import {
  isFinalReviewError,
  useApproveChannel,
  useRejectChannel,
  useReviewingChannel,
} from '@/features/channel/useChannelReview'
import { formatDate, formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminChannelsPage.module.css'

const TABS: { status: ChannelReviewStatus; label: string; empty: string }[] = [
  { status: 'PENDING', label: '심사 대기', empty: '심사 대기 채널이 없어요' },
  { status: 'APPROVED', label: '승인', empty: '승인한 채널이 없어요' },
  { status: 'REJECTED', label: '반려', empty: '반려한 채널이 없어요' },
]

/** 자주 쓰는 반려 사유 (목업 REJECT_TEMPLATES.channel) */
const REJECT_TEMPLATES = [
  '팔로워 10명·한 달 방송 10시간 기준에 모두 못 미쳐요',
  '채널 소개란에서 인증 코드를 찾을 수 없어요',
  '본인 채널인지 확인되지 않아요',
]

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 심사 대기다. 바꾸면 첫 페이지로 간다. */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const status =
    TABS.find((t) => t.status === params.get('status'))?.status ?? 'PENDING'
  const setStatus = (next: ChannelReviewStatus) => {
    const search = new URLSearchParams()
    if (next !== 'PENDING') search.set('status', next)
    setParams(search)
  }
  return [status, setStatus] as const
}

type Dialog = { type: 'approve' | 'reject'; review: ChannelReview } | null

export function AdminChannelsPage() {
  const [status, setStatus] = useStatusParam()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(channelReviewsQuery(status, page))
  const moving = useClampPage(page, query, setPage)
  // 머리글 건수는 탭과 관계없이 심사 대기 기준이다.
  const pending = useQuery(channelReviewsQuery('PENDING', 0))
  const pendingCount = pending.data?.page.totalElements
  const { data, error, isPending, refetch } = query
  const tab = TABS.find((t) => t.status === status) ?? TABS[0]
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)
  const approve = useApproveChannel()
  const reject = useRejectChannel()
  // 모달을 닫았다 열거나 화면을 다시 열어도, 진행 중인 승인·반려가 있으면 다시 보내지 못한다.
  const busy = useReviewingChannel()

  return (
    <div className="page">
      <PageHead
        title="채널 인증 심사"
        lede="팔로워 10명 미만이라 자동 승인되지 않은 채널이에요. 채널에 들어가 한 달 누적 방송 10시간을 확인하고 승인하거나 반려해요. 승인하면 유저는 인플루언서가 돼요."
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
          <ul className={styles.list} aria-label="채널 심사 목록">
            {data.content.map((review) => (
              <ReviewItem
                key={review.channelId}
                review={review}
                busy={busy}
                onApprove={() => setDialog({ type: 'approve', review })}
                onReject={() => setDialog({ type: 'reject', review })}
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
      {dialog?.type === 'approve' && (
        <ApproveDialog
          review={dialog.review}
          approve={approve}
          busy={busy}
          onClose={close}
        />
      )}
      {dialog?.type === 'reject' && (
        <RejectDialog
          review={dialog.review}
          reject={reject}
          busy={busy}
          onClose={close}
        />
      )}
    </div>
  )
}

function ReviewItem({
  review,
  busy,
  onApprove,
  onReject,
}: {
  review: ChannelReview
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const automatic = review.status === 'APPROVED' && review.verifiedBy === null
  return (
    <li className="q-item" aria-label={`${review.nickname}의 채널 인증 신청`}>
      <div className="row-main">
        <div className={styles.head}>
          <b>{review.nickname}</b>
          <span className="fine">회원 #{review.memberId}</span>
          <UpgradeStatusPill status={review.status} />
        </div>
        <a
          className={styles.channel}
          href={review.channelUrl}
          target="_blank"
          rel="noreferrer"
        >
          {PLATFORM_LABEL[review.platform]} · {review.channelName}
        </a>
        <span className="fine">
          팔로워 {formatNumber(review.followerCount)}명
          {review.followerCountAt &&
            ` (${formatDateTime(review.followerCountAt)} 기준)`}
          {review.requestedAt && ` · ${formatDate(review.requestedAt)} 신청`}
          {review.verifiedAt &&
            ` · ${formatDate(review.verifiedAt)} ${automatic ? '자동 승인' : '처리'}`}
        </span>
        {review.rejectionReason && (
          <span className={`fine c-bad ${styles.reason}`}>
            반려 사유: {review.rejectionReason}
          </span>
        )}
      </div>
      {review.status === 'PENDING' && (
        <div className="row-actions">
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={onReject}
          >
            반려
          </button>
          <button
            type="button"
            className="btn primary sm"
            disabled={busy}
            onClick={onApprove}
          >
            승인
          </button>
        </div>
      )}
    </li>
  )
}

type ApproveMutation = UseMutationResult<void, Error, number>
type RejectMutation = UseMutationResult<
  void,
  Error,
  { channelId: number; reason: string }
>

function ApproveDialog({
  review,
  approve,
  busy,
  onClose,
}: {
  review: ChannelReview
  approve: ApproveMutation
  busy: boolean
  onClose: () => void
}) {
  return (
    <Modal
      title="이 채널을 승인할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() =>
              approve.mutate(review.channelId, { onSettled: onClose })
            }
          >
            승인
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>회원</dt>
        <dd>
          {review.nickname} (회원 #{review.memberId})
        </dd>
        <dt>채널</dt>
        <dd>
          {PLATFORM_LABEL[review.platform]} · {review.channelName}
        </dd>
        <dt>팔로워</dt>
        <dd className="num">{formatNumber(review.followerCount)}명</dd>
      </dl>
      <p className="fine">
        승인하면 회원이 유저일 때 인플루언서가 되고, 권한이 바로 바뀌어요.
      </p>
    </Modal>
  )
}

function RejectDialog({
  review,
  reject,
  busy,
  onClose,
}: {
  review: ChannelReview
  reject: RejectMutation
  busy: boolean
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <Modal
      title="이 채널을 반려할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={!trimmed || busy}
            onClick={() =>
              // 직접 쓴 사유를 지키려고, 성공했거나 다시 시도해도 소용없는 오류일 때만 닫는다.
              reject.mutate(
                { channelId: review.channelId, reason: trimmed },
                {
                  onSuccess: onClose,
                  onError: (error) => {
                    if (isFinalReviewError(error)) onClose()
                  },
                },
              )
            }
          >
            반려
          </button>
        </>
      }
    >
      <p>
        {review.nickname}님의 {PLATFORM_LABEL[review.platform]} 채널 「
        {review.channelName}」
      </p>
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
      <Field
        id="channel-reject-reason"
        label="반려 사유"
        hint={`회원이 내 채널에서 보고 보완해 다시 요청해요. ${reason.length}/${REJECTION_REASON_MAX}`}
      >
        <textarea
          id="channel-reject-reason"
          className="textarea"
          value={reason}
          maxLength={REJECTION_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  )
}
