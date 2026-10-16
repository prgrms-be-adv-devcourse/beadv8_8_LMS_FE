import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { appearanceQuery } from '@/entities/appearance/api'
import {
  CANCEL_REQUEST_LIMIT,
  canHostCancel,
  canRequestCancel,
  confirmDeadline,
  confirmStage,
  PENALTY_RATE_PERCENT,
  pendingCancelRequest,
} from '@/entities/appearance/rules'
import type {
  Appearance,
  AppearanceCancelRequest,
  AppearanceCancelRequestStatus,
  HpReleaseStatus,
} from '@/entities/appearance/types'
import { AppearanceStatusPill } from '@/entities/appearance/ui/AppearanceStatusPill'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import {
  AcceptCancelModal,
  HostCancelModal,
  RejectCancelModal,
  RequestCancelModal,
} from '@/features/appearance-cancel/CancelModals'
import {
  AbsentModal,
  ConfirmAppearanceModal,
} from '@/features/appearance-confirm/ConfirmModals'
import { meQuery } from '@/shared/auth/me'
import { formatDateTime, isPast } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AppearanceDetailPage.module.css'

type ModalType =
  'request' | 'accept' | 'reject' | 'hostCancel' | 'confirm' | 'absent' | null

export function AppearanceDetailPage() {
  const appearanceId = Number(useParams().appearanceId)
  const { data: me } = useQuery(meQuery)
  const { data, error, isPending, refetch } = useQuery(
    appearanceQuery(appearanceId),
  )
  return (
    <div className="page">
      <Link className="back" to="/appearances">
        ← 내 출연
      </Link>
      {isPending || !me ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Detail appearance={data} host={data.hostId === me.id} />
      )}
    </div>
  )
}

function Detail({
  appearance,
  host,
}: {
  appearance: Appearance
  host: boolean
}) {
  const [modal, setModal] = useState<ModalType>(null)
  const close = () => setModal(null)
  const partnerId = host ? appearance.guestId : appearance.hostId
  const pending = pendingCancelRequest(appearance)
  const aired = isPast(appearance.scheduledAt)
  const awaiting = confirmStage(appearance) === 'open'
  const sourceLink =
    appearance.sourceType === 'RECRUIT' && appearance.recruitId
      ? { to: `/recruits/${appearance.recruitId}`, label: '모집글 보기' }
      : appearance.requestId
        ? {
            to: `/appearances/requests/${appearance.requestId}`,
            label: '요청서 보기',
          }
        : null

  return (
    <>
      <div className={styles.head}>
        <h1>{appearance.title}</h1>
        <AppearanceStatusPill
          status={appearance.status}
          awaiting={awaiting ? (host ? 'host' : 'guest') : undefined}
        />
      </div>
      <div className="split">
        <div className="page" style={{ gap: 16 }}>
          <section className="panel">
            <div className="panel-head">
              <MemberChip memberId={partnerId} />
              <span className="fine">
                {host ? '내가 호스트 · 게스트' : '내가 게스트 · 호스트'} ·{' '}
                {appearance.sourceType === 'RECRUIT'
                  ? '출연 모집'
                  : '출연 요청'}
              </span>
            </div>
            <dl className="kv">
              <dt>출연료</dt>
              <dd className="num">{formatNumber(appearance.fee)} HP</dd>
              <dt>방송 예정</dt>
              <dd>{formatDateTime(appearance.scheduledAt)}</dd>
              <dt>성립</dt>
              <dd>{formatDateTime(appearance.establishedAt)}</dd>
              {appearance.canceledAt && (
                <>
                  <dt>취소</dt>
                  <dd>{formatDateTime(appearance.canceledAt)}</dd>
                </>
              )}
              {appearance.confirmedAt && (
                <>
                  <dt>확인</dt>
                  <dd>
                    {formatDateTime(appearance.confirmedAt)} ·{' '}
                    {appearance.confirmType === 'AUTO'
                      ? '자동 확인'
                      : '호스트 확인'}
                  </dd>
                </>
              )}
              {appearance.absentAt && (
                <>
                  <dt>불참 처리</dt>
                  <dd>{formatDateTime(appearance.absentAt)}</dd>
                </>
              )}
              {appearance.penaltyAmount !== null && (
                <>
                  <dt>위약금</dt>
                  <dd className="num">
                    {formatNumber(appearance.penaltyAmount)} HP (게스트에게
                    지급)
                  </dd>
                </>
              )}
            </dl>
            {sourceLink && (
              <Link className="link" to={sourceLink.to}>
                {sourceLink.label}
              </Link>
            )}
          </section>
          <CancelHistory requests={appearance.cancelRequests} />
        </div>
        <aside className="panel sticky">
          <StatusNote appearance={appearance} host={host} />
          {!host && canRequestCancel(appearance) && (
            <button
              type="button"
              className="btn block"
              onClick={() => setModal('request')}
            >
              출연 취소 요청
            </button>
          )}
          {!host &&
            appearance.status === 'ESTABLISHED' &&
            !aired &&
            appearance.cancelRequests.length >= CANCEL_REQUEST_LIMIT && (
              <p className="fine">
                출연 취소 요청은 {CANCEL_REQUEST_LIMIT}번까지 보낼 수 있어요.
              </p>
            )}
          {host && pending && !aired && (
            <>
              <button
                type="button"
                className="btn primary block"
                onClick={() => setModal('accept')}
              >
                취소 요청 수락
              </button>
              <button
                type="button"
                className="btn block"
                onClick={() => setModal('reject')}
              >
                취소 요청 거절
              </button>
            </>
          )}
          {host && awaiting && (
            <>
              <button
                type="button"
                className="btn primary block"
                onClick={() => setModal('confirm')}
              >
                출연 확인
              </button>
              <button
                type="button"
                className="btn block"
                onClick={() => setModal('absent')}
              >
                불참
              </button>
            </>
          )}
          {host && canHostCancel(appearance) && (
            <button
              type="button"
              className="btn danger block"
              onClick={() => setModal('hostCancel')}
            >
              출연 취소 (위약금 {PENALTY_RATE_PERCENT}%)
            </button>
          )}
        </aside>
      </div>
      {modal === 'request' && (
        <RequestCancelModal appearance={appearance} onClose={close} />
      )}
      {modal === 'accept' && (
        <AcceptCancelModal appearance={appearance} onClose={close} />
      )}
      {modal === 'reject' && (
        <RejectCancelModal appearance={appearance} onClose={close} />
      )}
      {modal === 'hostCancel' && (
        <HostCancelModal appearance={appearance} onClose={close} />
      )}
      {modal === 'confirm' && (
        <ConfirmAppearanceModal appearance={appearance} onClose={close} />
      )}
      {modal === 'absent' && (
        <AbsentModal appearance={appearance} onClose={close} />
      )}
    </>
  )
}

const REQUEST_STATUS: Record<
  AppearanceCancelRequestStatus,
  [tone: string, label: string]
> = {
  REQUESTED: ['warn', '처리 중'],
  ACCEPTED: ['ok', '수락 · 합의 취소'],
  REJECTED: ['mute', '거절'],
  AUTO_REJECTED: ['mute', '응답 없어 자동 거절'],
  CLOSED_BY_HOST_CANCEL: ['mute', '호스트 취소로 종료'],
}

/** 출연 취소 요청 이력 (최대 2건) */
function CancelHistory({ requests }: { requests: AppearanceCancelRequest[] }) {
  if (requests.length === 0) return null
  return (
    <section className="panel">
      <h2>출연 취소 요청</h2>
      <ul className={`rows ${styles.history}`} aria-label="출연 취소 요청 이력">
        {requests.map((r) => {
          const [tone, label] = REQUEST_STATUS[r.status]
          return (
            <li key={r.id} className="row-item">
              <div className="row-main">
                <div className={styles.historyHead}>
                  <b>{r.sequence}번째 요청</b>
                  <span className={`pill ${tone}`}>{label}</span>
                  <span className="fine">
                    {formatDateTime(r.requestedAt)} 요청
                    {r.respondedAt &&
                      ` · ${formatDateTime(r.respondedAt)} 응답`}
                  </span>
                </div>
                <span className={styles.reason}>사유: {r.reason}</span>
                {r.rejectReason && (
                  <span className={`fine ${styles.reason}`}>
                    거절 사유: {r.rejectReason}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const HP_TASK: Record<HpReleaseStatus, string> = {
  PENDING: '처리 중이에요.',
  DONE: '마쳤어요.',
  DEAD: '늦어지고 있어요. 고객센터로 문의해 주세요.',
}

function TaskNote({
  label,
  status,
}: {
  label: string
  status: HpReleaseStatus
}) {
  return (
    <p className={status === 'DEAD' ? 'fine c-bad' : 'fine'}>
      {label} {HP_TASK[status]}
    </p>
  )
}

/** 지금 상태에서 무슨 일이 일어나는지 */
function StatusNote({
  appearance,
  host,
}: {
  appearance: Appearance
  host: boolean
}) {
  const aired = isPast(appearance.scheduledAt)
  const deadline = formatDateTime(confirmDeadline(appearance.scheduledAt))
  switch (appearance.status) {
    case 'ESTABLISHED':
      if (confirmStage(appearance) === 'ended')
        return (
          <p className="fine">
            확인 기간이 지나 곧 자동으로 출연이 확인돼요. 출연료는 게스트에게
            지급돼요.
          </p>
        )
      if (aired)
        return host ? (
          <p className="fine">
            방송 예정 일시가 지났어요. {deadline}까지 출연 확인이나 불참으로
            응답해 주세요. 응답하지 않으면 그때 자동으로 확인돼 출연료가
            게스트에게 지급돼요.
          </p>
        ) : (
          <p className="fine">
            방송 예정 일시가 지났어요. 호스트가 출연을 확인하거나 {deadline}에
            자동 확인되면 출연료가 지급돼요.
          </p>
        )
      return host ? (
        <p className="fine">
          방송 예정 일시 전에 취소하면 출연료의 {PENALTY_RATE_PERCENT}%가
          위약금으로 게스트에게 지급돼요.
        </p>
      ) : (
        <p className="fine">
          방송 예정 일시 전까지 호스트에게 출연 취소를 요청할 수 있어요.
          호스트가 수락하면 위약금 없이 취소돼요.
        </p>
      )
    case 'CANCEL_REQUESTED':
      if (aired)
        return (
          <p className="fine">
            방송 예정 일시가 지나 취소 요청은 곧 자동 거절되고 출연이 유지돼요.
            {host && ' 그 뒤 출연 확인·불참으로 응답할 수 있어요.'}
          </p>
        )
      return host ? (
        <p className="fine">
          게스트가 출연 취소를 요청했어요. 수락하면 위약금 없이 합의 취소되고,
          거절하거나 방송 예정 일시까지 답하지 않으면 출연이 유지돼요.
        </p>
      ) : (
        <p className="fine">
          취소 요청을 보냈어요. 호스트가 수락하면 위약금 없이 취소되고, 방송
          예정 일시까지 답이 없으면 출연이 유지돼요.
        </p>
      )
    case 'CANCELED_BY_HOST':
      return (
        <>
          <p className="fine">
            {host ? '출연을 취소했어요.' : '호스트가 출연을 취소했어요.'}
            {appearance.hostCancelReason &&
              ` 사유: ${appearance.hostCancelReason}`}
          </p>
          {appearance.hpPenaltyStatus && (
            <TaskNote
              label="위약금 정산을"
              status={appearance.hpPenaltyStatus}
            />
          )}
        </>
      )
    case 'CANCELED_BY_AGREEMENT':
      return (
        <>
          <p className="fine">
            게스트의 취소 요청을 호스트가 수락해 위약금 없이 취소됐어요.
          </p>
          {host && appearance.hpReleaseStatus && (
            <TaskNote
              label="출연료 반환을"
              status={appearance.hpReleaseStatus}
            />
          )}
        </>
      )
    case 'CONFIRMED':
      return (
        <>
          <p className="fine">
            {appearance.confirmType === 'AUTO'
              ? '확인 기간이 지나 자동으로 출연이 확인됐어요.'
              : '호스트가 출연을 확인했어요.'}{' '}
            출연료는 게스트에게 지급돼요.
          </p>
          {appearance.hpPayoutStatus && (
            <TaskNote
              label="출연료 지급을"
              status={appearance.hpPayoutStatus}
            />
          )}
        </>
      )
    case 'ABSENT':
      return (
        <>
          <p className="fine">
            {host
              ? '불참으로 처리해 출연료를 돌려받아요.'
              : '호스트가 불참으로 처리해 출연료가 호스트에게 돌아가요.'}
            {appearance.absentReason && ` 사유: ${appearance.absentReason}`}
          </p>
          {!host && (
            <p className="fine">
              출연했는데 불참으로 처리됐다면{' '}
              <Link className="link" to="/support">
                고객센터 문의
              </Link>
              로 알려 주세요.
            </p>
          )}
          {host && appearance.hpReleaseStatus && (
            <TaskNote
              label="출연료 반환을"
              status={appearance.hpReleaseStatus}
            />
          )}
        </>
      )
  }
}
