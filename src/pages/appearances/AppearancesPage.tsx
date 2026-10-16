import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import {
  appearanceRequestsQuery,
  appearancesQuery,
  HOLD_PENDING_PARAM,
} from '@/entities/appearance/api'
import type {
  AppearanceRequestSummary,
  AppearanceSummary,
  RequestSide,
} from '@/entities/appearance/types'
import { confirmStage } from '@/entities/appearance/rules'
import { AppearanceStatusPill } from '@/entities/appearance/ui/AppearanceStatusPill'
import { RequestStatusPill } from '@/entities/appearance/ui/RequestStatusPill'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { formatDate, formatDateTime, formatDday } from '@/shared/lib/date'
import {
  HOLD_POLL_INTERVAL_MS,
  useLimitedPolling,
} from '@/shared/lib/useLimitedPolling'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { Tabs } from '@/shared/ui/Tabs'
import styles from './AppearancesPage.module.css'

const TABS: { value: RequestSide; label: string }[] = [
  { value: 'host', label: '호스트로 (보낸 요청)' },
  { value: 'guest', label: '게스트로 (받은 요청)' },
]

export function AppearancesPage() {
  const [params, setParams] = useSearchParams()
  const side: RequestSide = params.get('tab') === 'guest' ? 'guest' : 'host'
  // 요청 목록 페이지. 성립한 출연 목록은 apage로 따로 넘긴다. 한쪽을 넘겨도 다른 쪽 페이지와 처리 중 안내는 남는다.
  const [page, setPage] = usePageParam('page')
  const holdPending = side === 'host' && params.get(HOLD_PENDING_PARAM) === '1'
  const polling = useLimitedPolling(holdPending)
  const query = useQuery({
    ...appearanceRequestsQuery(side, page),
    refetchInterval: polling ? HOLD_POLL_INTERVAL_MS : false,
  })
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch, isFetching } = query

  // 역할을 바꾸면 두 목록 모두 첫 페이지부터 보고, 처리 중 안내는 닫는다.
  const selectTab = (tab: RequestSide) =>
    setParams(tab === 'guest' ? { tab: 'guest' } : {})
  const dismissHoldPending = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(HOLD_PENDING_PARAM)
      return next
    })

  return (
    <div className="page">
      <PageHead
        title="내 출연"
        lede="성립한 출연과 출연 요청을 역할별로 함께 관리해요. 요청을 보내면 출연료만큼 HP가 보류되고, 성립한 출연은 상세에서 취소를 요청하거나 처리할 수 있어요."
        actions={
          <Link className="btn" to="/influencers">
            게스트 찾기
          </Link>
        }
      />
      <Tabs label="내 역할" items={TABS} value={side} onChange={selectTab}>
        <AppearanceList side={side} />
        <h2 className={styles.sectionTitle}>
          {side === 'host' ? '보낸 출연 요청' : '받은 출연 요청'}
        </h2>
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
              onClick={dismissHoldPending}
            >
              닫기
            </button>
          </div>
        )}
        {isPending || moving ? (
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
              onChange={setPage}
            />
          </>
        )}
      </Tabs>
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

/** 성립한 출연 (요청·모집에서 성립한 건). 카드를 누르면 출연 상세에서 취소 요청·일방 취소를 한다 */
function AppearanceList({ side }: { side: RequestSide }) {
  const [page, setPage] = usePageParam('apage')
  const query = useQuery(
    appearancesQuery(side === 'host' ? 'HOST' : 'GUEST', page),
  )
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query
  return (
    <section aria-label="성립한 출연" className={styles.section}>
      <h2 className={styles.sectionTitle}>성립한 출연</h2>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <p className="fine">아직 성립한 출연이 없어요.</p>
      ) : (
        <>
          <div className="page" style={{ gap: 12 }}>
            {data.content.map((appearance) => (
              <AppearanceCard
                key={appearance.id}
                appearance={appearance}
                side={side}
              />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </section>
  )
}

function AppearanceCard({
  appearance,
  side,
}: {
  appearance: AppearanceSummary
  side: RequestSide
}) {
  const partnerId = side === 'host' ? appearance.guestId : appearance.hostId
  // 방송이 끝나 호스트의 출연 확인을 기다린다
  const awaiting = confirmStage(appearance) === 'open'
  // 호스트가 답해야 하는 취소 요청·출연 확인은 눈에 띄게 한다.
  const attn =
    side === 'host' && (appearance.status === 'CANCEL_REQUESTED' || awaiting)
  return (
    <Link
      to={`/appearances/${appearance.id}`}
      className={attn ? `${styles.card} ${styles.attn}` : styles.card}
    >
      <div className={styles.head}>
        <MemberChip memberId={partnerId} />
        <span className="fine">
          {side === 'host' ? '게스트' : '호스트'} ·{' '}
          {appearance.sourceType === 'RECRUIT' ? '출연 모집' : '출연 요청'}
        </span>
        <span className={styles.spacer} />
        <AppearanceStatusPill
          status={appearance.status}
          awaiting={awaiting ? side : undefined}
        />
      </div>
      <span className={styles.title}>{appearance.title}</span>
      <div className={styles.grid}>
        <div>
          <span>출연료</span>
          <b className="num">{formatNumber(appearance.fee)} HP</b>
        </div>
        <div>
          <span>방송 예정</span>
          <b>{formatDateTime(appearance.scheduledAt)}</b>
        </div>
      </div>
    </Link>
  )
}
