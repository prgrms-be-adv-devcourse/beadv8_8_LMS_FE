import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import {
  appearanceRequestsQuery,
  appearancesQuery,
  appearanceTodoCountQuery,
} from '@/entities/appearance/api'
import type {
  AppearanceRequestSummary,
  AppearanceSummary,
  RequestSide,
} from '@/entities/appearance/types'
import { confirmStage } from '@/entities/appearance/rules'
import { AppearanceListViewSelect } from '@/entities/appearance/ui/AppearanceListViewSelect'
import { AppearanceStatusPill } from '@/entities/appearance/ui/AppearanceStatusPill'
import { HoldListViewSelect } from '@/entities/appearance/ui/HoldListView'
import { useAppearanceListView } from '@/entities/appearance/useAppearanceListView'
import { useHoldListView } from '@/entities/appearance/useHoldListView'
import { RequestStatusPill } from '@/entities/appearance/ui/RequestStatusPill'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { formatDate, formatDateTime, formatDday } from '@/shared/lib/date'
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

/** 역할 탭마다 응답할 일 개수(서버 totalElements)를 붙인다. 불러오기 전·실패면 개수 없이 둔다 */
function useRoleTabs() {
  const host = useQuery(appearanceTodoCountQuery('host')).data
  const guest = useQuery(appearanceTodoCountQuery('guest')).data
  const counts: Record<RequestSide, number | undefined> = { host, guest }
  return TABS.map((tab) => {
    const value = counts[tab.value]
    return value
      ? { ...tab, count: { value, label: `응답 필요 ${value}건` } }
      : tab
  })
}

export function AppearancesPage() {
  const [params, setParams] = useSearchParams()
  const side: RequestSide = params.get('tab') === 'guest' ? 'guest' : 'host'
  // 요청 목록 페이지. 성립한 출연 목록은 apage로 따로 넘긴다. 한쪽을 넘겨도 다른 쪽 페이지는 남는다.
  const [page, setPage] = usePageParam('page')
  const [selectedView, selectView] = useHoldListView()
  // 보기는 보낸 요청에만 있다(받은 요청에는 보류 상태 요청서가 나오지 않는다).
  const view = side === 'host' ? selectedView : 'active'
  // 보류 확인 중인 요청서가 보이는 동안 목록이 스스로 다시 부른다(appearanceRequestsQuery).
  const query = useQuery(appearanceRequestsQuery(side, page, view))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query
  const tabs = useRoleTabs()

  // 역할을 바꾸면 두 목록 모두 첫 페이지·기본 보기부터 본다.
  const selectTab = (tab: RequestSide) =>
    setParams(tab === 'guest' ? { tab: 'guest' } : {})

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
      <Tabs label="내 역할" items={tabs} value={side} onChange={selectTab}>
        <AppearanceList side={side} />
        <h2 className={styles.sectionTitle}>
          {side === 'host' ? '보낸 출연 요청' : '받은 출연 요청'}
        </h2>
        {side === 'host' && (
          <div className="toolbar">
            <span className="fine">
              {view === 'failed'
                ? 'HP 보류에 실패해 보내지지 않은 요청서예요.'
                : '포인트 확인 중인 요청서는 확인이 끝나면 자동으로 바뀌어요.'}
            </span>
            <HoldListViewSelect value={view} onChange={selectView} />
          </div>
        )}
        {isPending || moving ? (
          <Loading />
        ) : error ? (
          <LoadError error={error} retry={refetch} />
        ) : data.content.length === 0 ? (
          side === 'host' && view === 'failed' ? (
            <EmptyState title="보내지지 않은 요청서가 없어요">
              HP 보류에 실패한 요청서가 여기에 보여요.
            </EmptyState>
          ) : side === 'host' ? (
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

/**
 * 성립한 출연 (요청·모집에서 성립한 건). 진행 중(기본)과 끝난 출연을 보기로 나눈다.
 * 카드를 누르면 출연 상세에서 취소 요청·일방 취소를 한다
 */
function AppearanceList({ side }: { side: RequestSide }) {
  const [page, setPage] = usePageParam('apage')
  const [view, selectView] = useAppearanceListView()
  const query = useQuery(
    appearancesQuery(side === 'host' ? 'HOST' : 'GUEST', page, view),
  )
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query
  return (
    <section aria-label="성립한 출연" className={styles.section}>
      <div className="toolbar">
        <h2 className={styles.sectionTitle}>성립한 출연</h2>
        <AppearanceListViewSelect value={view} onChange={selectView} />
      </div>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <p className="fine">
          {view === 'ended'
            ? '끝난 출연이 없어요.'
            : '진행 중인 출연이 없어요.'}
        </p>
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
