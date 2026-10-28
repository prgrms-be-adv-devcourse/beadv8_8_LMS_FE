import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { appearanceRequestQuery } from '@/entities/appearance/api'
import { PENALTY_RATE_PERCENT } from '@/entities/appearance/rules'
import type {
  AppearanceRequest,
  HpReleaseStatus,
  RequestSide,
} from '@/entities/appearance/types'
import { RequestStatusPill } from '@/entities/appearance/ui/RequestStatusPill'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import {
  AcceptRequestModal,
  CancelRequestModal,
  EditRequestModal,
  RejectRequestModal,
} from '@/features/appearance-request/RespondModals'
import { meQuery } from '@/shared/auth/me'
import { formatDateTime, formatDday, isPast } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AppearanceRequestPage.module.css'

// 수락 확인창은 연 순간의 요청서를 따로 들고 있는다(그사이 상세가 다시 조회돼도 본 버전 그대로 수락).
type ModalState =
  | { type: 'accept'; snapshot: AppearanceRequest }
  | { type: 'reject' | 'cancel' | 'edit' }
  | null

export function AppearanceRequestPage() {
  const requestId = Number(useParams().requestId)
  const { data: me } = useQuery(meQuery)
  const { data, error, isPending, refetch } = useQuery(
    appearanceRequestQuery(requestId),
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
        <Detail
          request={data}
          side={data.hostId === me.id ? 'host' : 'guest'}
        />
      )}
    </div>
  )
}

function Detail({
  request,
  side,
}: {
  request: AppearanceRequest
  side: RequestSide
}) {
  const [modal, setModal] = useState<ModalState>(null)
  const close = () => setModal(null)
  const waiting = request.status === 'REQUESTED'
  const expired = waiting && isPast(request.acceptDeadline)
  const partnerId = side === 'host' ? request.guestId : request.hostId

  return (
    <>
      <div className={styles.head}>
        <h1>{request.title}</h1>
        <RequestStatusPill status={request.status} side={side} />
      </div>
      <div className="split">
        <div className="page" style={{ gap: 16 }}>
          <section className="panel">
            <div className="panel-head">
              <MemberChip memberId={partnerId} />
              <span className="fine">
                {side === 'host'
                  ? '내가 보낸 요청 · 게스트'
                  : '내가 받은 요청 · 호스트'}
              </span>
            </div>
            <dl className="kv">
              <dt>출연료</dt>
              <dd className="num">{formatNumber(request.fee)} HP</dd>
              <dt>방송 예정</dt>
              <dd>{formatDateTime(request.scheduledAt)}</dd>
              <dt>예상 출연 시간</dt>
              <dd>{request.expectedMinutes}분</dd>
              <dt>수락 기한</dt>
              <dd>
                {formatDateTime(request.acceptDeadline)}
                {waiting && ` · ${formatDday(request.acceptDeadline)}`}
              </dd>
              <dt>호스트 채널</dt>
              <dd>
                <a
                  href={request.hostChannelUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {request.hostChannelUrl}
                </a>
              </dd>
            </dl>
          </section>
          <section className="panel">
            <h2>요청 내용</h2>
            <p className={styles.content}>{request.content}</p>
          </section>
        </div>
        <aside className="panel sticky">
          <StatusNote request={request} side={side} expired={expired} />
          {waiting && !expired && side === 'guest' && (
            <>
              <button
                type="button"
                className="btn primary block"
                onClick={() => setModal({ type: 'accept', snapshot: request })}
              >
                수락
              </button>
              <button
                type="button"
                className="btn block"
                onClick={() => setModal({ type: 'reject' })}
              >
                거절
              </button>
            </>
          )}
          {waiting && side === 'host' && (
            <>
              {!expired && (
                <button
                  type="button"
                  className="btn block"
                  onClick={() => setModal({ type: 'edit' })}
                >
                  요청서 고치기
                </button>
              )}
              <button
                type="button"
                className="btn danger block"
                onClick={() => setModal({ type: 'cancel' })}
              >
                요청 취소
              </button>
            </>
          )}
        </aside>
      </div>
      {modal?.type === 'accept' && (
        <AcceptRequestModal snapshot={modal.snapshot} onClose={close} />
      )}
      {modal?.type === 'reject' && (
        <RejectRequestModal request={request} onClose={close} />
      )}
      {modal?.type === 'cancel' && (
        <CancelRequestModal request={request} onClose={close} />
      )}
      {modal?.type === 'edit' && (
        <EditRequestModal request={request} onClose={close} />
      )}
    </>
  )
}

const RELEASE_LABEL: Record<HpReleaseStatus, string> = {
  PENDING: '보류 HP 반환 처리 중이에요.',
  DONE: '보류 HP 반환을 마쳤어요.',
  DEAD: '보류 HP 반환이 늦어지고 있어요. 고객센터로 문의해 주세요.',
}

/** 지금 상태에서 무슨 일이 일어나는지 */
function StatusNote({
  request,
  side,
  expired,
}: {
  request: AppearanceRequest
  side: RequestSide
  expired: boolean
}) {
  const host = side === 'host'
  // 보류 HP는 호스트 것이라 반환 상태는 호스트에게만 보여 준다.
  const release = host && request.hpReleaseStatus && (
    <p className={request.hpReleaseStatus === 'DEAD' ? 'fine c-bad' : 'fine'}>
      {RELEASE_LABEL[request.hpReleaseStatus]}
    </p>
  )
  switch (request.status) {
    case 'REQUESTED':
      if (expired)
        return (
          <p className="fine">
            수락 기한이 지났어요. 곧 만료 처리되고 보류된 HP는 호스트에게
            돌아가요.
          </p>
        )
      return host ? (
        <p className="fine">
          {formatDateTime(request.acceptDeadline)}까지 게스트가 수락하지 않으면
          보류한 {formatNumber(request.fee)} HP를 돌려받아요. 응답 전에는 위약금
          없이 취소할 수 있어요.
        </p>
      ) : (
        <p className="fine">
          {formatDateTime(request.acceptDeadline)}까지 수락하지 않으면 요청이
          만료돼요. 출연료는 방송 뒤 호스트가 출연을 확인하면 지급돼요.
        </p>
      )
    case 'ACCEPTED':
      return (
        <>
          <p className="fine">
            {request.respondedAt && `${formatDateTime(request.respondedAt)}에 `}
            출연이 성립했어요.
            {host
              ? ` 방송 예정일 전에 호스트가 취소하면 출연료의 ${PENALTY_RATE_PERCENT}%가 위약금으로 게스트에게 지급돼요.`
              : ' 방송 예정일 전에 호스트에게 출연 취소를 요청할 수 있어요.'}
          </p>
          {request.appearanceId !== null && (
            <Link className="link" to={`/appearances/${request.appearanceId}`}>
              출연 상세에서 취소하기
            </Link>
          )}
        </>
      )
    case 'REJECTED':
      return (
        <>
          <p className="fine">
            {host ? '게스트가 요청을 거절했어요.' : '요청을 거절했어요.'}
            {request.rejectReason && ` 사유: ${request.rejectReason}`}
          </p>
          {release}
        </>
      )
    case 'EXPIRED':
      return (
        <>
          <p className="fine">수락 기한까지 응답이 없어 요청이 만료됐어요.</p>
          {release}
        </>
      )
    case 'CANCELED':
      return (
        <>
          <p className="fine">
            {request.canceledAt && `${formatDateTime(request.canceledAt)}에 `}
            {host ? '요청을 취소했어요.' : '호스트가 요청을 취소했어요.'}
          </p>
          {release}
        </>
      )
    default:
      return null
  }
}
