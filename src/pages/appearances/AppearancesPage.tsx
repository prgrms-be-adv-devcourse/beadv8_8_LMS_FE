import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  appearanceRequestsQuery,
  HOLD_PENDING_PARAM,
} from '@/entities/appearance/api'
import type {
  AppearanceRequestSummary,
  RequestSide,
} from '@/entities/appearance/types'
import { RequestStatusPill } from '@/entities/appearance/ui/RequestStatusPill'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { formatDate, formatDateTime, formatDday } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AppearancesPage.module.css'

/** HP 보류 결과를 기다리는 동안 보낸 요청 목록을 다시 부르는 간격·시간 */
export const HOLD_POLL_INTERVAL_MS = 5_000
export const HOLD_POLL_DURATION_MS = 60_000

const TABS: { side: RequestSide; label: string }[] = [
  { side: 'host', label: '호스트로 (보낸 요청)' },
  { side: 'guest', label: '게스트로 (받은 요청)' },
]

export function AppearancesPage() {
  const [params, setParams] = useSearchParams()
  const side: RequestSide = params.get('tab') === 'guest' ? 'guest' : 'host'
  const page = Math.max(0, Number(params.get('page') ?? '1') - 1) || 0
  const holdPending = side === 'host' && params.get(HOLD_PENDING_PARAM) === '1'
  const polling = useLimitedPolling(holdPending)
  const { data, error, isPending, refetch, isFetching } = useQuery({
    ...appearanceRequestsQuery(side, page),
    refetchInterval: polling ? HOLD_POLL_INTERVAL_MS : false,
  })

  const go = (next: {
    tab?: RequestSide
    page?: number
    keepHoldPending?: boolean
  }) => {
    const search = new URLSearchParams()
    const tab = next.tab ?? side
    if (tab === 'guest') search.set('tab', 'guest')
    const p = next.page ?? 0
    if (p > 0) search.set('page', String(p + 1))
    // 보낸 요청 안에서 페이지를 넘길 때는 처리 중 안내를 유지한다.
    if (next.keepHoldPending && holdPending) search.set(HOLD_PENDING_PARAM, '1')
    setParams(search)
  }

  return (
    <div className="page">
      <PageHead
        title="내 출연"
        lede="호스트로 보낸 출연 요청과 게스트로 받은 요청을 함께 관리해요. 요청을 보내면 출연료만큼 HP가 보류돼요."
        actions={
          <Link className="btn" to="/influencers">
            게스트 찾기
          </Link>
        }
      />
      <div className={styles.tabs} role="tablist" aria-label="내 역할">
        {TABS.map((t) => (
          <button
            key={t.side}
            type="button"
            role="tab"
            aria-selected={side === t.side}
            className={
              side === t.side ? `${styles.tab} ${styles.on}` : styles.tab
            }
            onClick={() => go({ tab: t.side })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {holdPending && (
        <div className="notice warn" role="status">
          <span>
            요청은 접수됐고 HP 보류 결과를 확인하고 있어요.
            {polling
              ? ' 보류가 끝나면 아래 목록에 나타나요.'
              : ' 아직 목록에 없으면 새로고침해 보세요. 잔액이 부족했다면 요청이 등록되지 않아요.'}
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            새로고침
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => go({ page })}
          >
            닫기
          </button>
        </div>
      )}
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        side === 'host' ? (
          <EmptyState
            title="아직 보낸 출연 요청이 없어요"
            action={
              <Link className="btn primary" to="/influencers">
                게스트 찾기
              </Link>
            }
          >
            인플루언서 프로필에서 출연 요청을 보낼 수 있어요.
          </EmptyState>
        ) : (
          <EmptyState title="아직 받은 출연 요청이 없어요">
            다른 인플루언서가 출연을 요청하면 여기에 보여요.
          </EmptyState>
        )
      ) : (
        <>
          <div className="page" style={{ gap: 12 }}>
            {data.content.map((request) => (
              <RequestCard key={request.id} request={request} side={side} />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={(p) => go({ page: p, keepHoldPending: true })}
          />
        </>
      )}
    </div>
  )
}

function RequestCard({
  request,
  side,
}: {
  request: AppearanceRequestSummary
  side: RequestSide
}) {
  const partnerId = side === 'host' ? request.guestId : request.hostId
  const waiting = request.status === 'REQUESTED'
  return (
    <Link
      to={`/appearances/requests/${request.id}`}
      className={
        waiting && side === 'guest'
          ? `${styles.card} ${styles.attn}`
          : styles.card
      }
    >
      <div className={styles.head}>
        <MemberChip memberId={partnerId} />
        <span className="fine">{side === 'host' ? '게스트' : '호스트'}</span>
        <span className={styles.spacer} />
        <RequestStatusPill status={request.status} side={side} />
      </div>
      <span className={styles.title}>{request.title}</span>
      <div className={styles.grid}>
        <div>
          <span>출연료</span>
          <b className="num">{formatNumber(request.fee)} HP</b>
        </div>
        <div>
          <span>방송 예정</span>
          <b>{formatDateTime(request.scheduledAt)}</b>
        </div>
        {waiting && (
          <div>
            <span>수락 기한</span>
            <b>
              {formatDate(request.acceptDeadline)} ·{' '}
              {formatDday(request.acceptDeadline)}
            </b>
          </div>
        )}
      </div>
    </Link>
  )
}

/** active인 동안 정해진 시간만 true. 그 뒤로는 수동 새로고침에 맡긴다. */
function useLimitedPolling(active: boolean) {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setExpired(true), HOLD_POLL_DURATION_MS)
    return () => clearTimeout(timer)
  }, [active])
  return active && !expired
}
