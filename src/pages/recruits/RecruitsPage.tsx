import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { myApplicationsQuery, recruitsQuery } from '@/entities/appearance/api'
import { hasRecruitConditions } from '@/entities/appearance/recruitSearch'
import type {
  Application,
  RecruitListTab,
  RecruitSummary,
} from '@/entities/appearance/types'
import { AirDate } from '@/entities/appearance/ui/AirDate'
import { ApplicationStatusPill } from '@/entities/appearance/ui/ApplicationStatusPill'
import { CardSkeleton } from '@/entities/appearance/ui/CardSkeleton'
import { HoldListViewSelect } from '@/entities/appearance/ui/HoldListView'
import { useHoldListView } from '@/entities/appearance/useHoldListView'
import {
  RecruitDeadlinePill,
  RecruitStatusOnlyPill,
} from '@/entities/appearance/ui/RecruitStatusPill'
import { RecruitSeats } from '@/entities/appearance/ui/RecruitSeats'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { RecruitFormModal } from '@/features/recruit/RecruitFormModal'
import { RecruitSearchBar } from '@/features/recruit-search/RecruitSearchBar'
import { useRecruitSearch } from '@/features/recruit-search/useRecruitSearch'
import { isApiError } from '@/shared/api/ApiError'
import { meQuery } from '@/shared/auth/me'
import { INFLUENCER } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError } from '@/shared/ui/QueryState'
import { Tabs } from '@/shared/ui/Tabs'
import styles from './RecruitsPage.module.css'

type Tab = RecruitListTab | 'applications'

const TABS: { value: Tab; label: string }[] = [
  { value: 'open', label: '모집 중' },
  { value: 'mine', label: '내 모집글' },
  { value: 'applications', label: '내 지원' },
]

export function RecruitsPage() {
  const viewer = useViewer()
  const influencer = viewer !== undefined && INFLUENCER.includes(viewer)
  const [params, merge] = useMergedSearchParams()
  const requested = params.get('tab')
  // 내 모집글·내 지원은 인플루언서만 쓴다. 다른 역할은 주소에 있어도 모집 중을 보여 준다.
  const tab: Tab =
    influencer && (requested === 'mine' || requested === 'applications')
      ? requested
      : 'open'
  const [writing, setWriting] = useState(false)

  const selectTab = (next: Tab) =>
    merge(() => new URLSearchParams(next === 'open' ? {} : { tab: next }))
  const list =
    tab === 'applications' ? (
      <MyApplications />
    ) : (
      <Recruits key={tab} tab={tab} />
    )

  return (
    <div className="page">
      <PageHead
        title="출연 모집"
        lede="호스트가 여러 게스트를 공개 모집해요. 게시할 때 1인당 출연료 × 모집 인원만큼 HP가 보류돼요."
        actions={
          influencer && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setWriting(true)}
            >
              모집글 올리기
            </button>
          )
        }
      />
      {influencer ? (
        <Tabs label="모집 목록" items={TABS} value={tab} onChange={selectTab}>
          {list}
        </Tabs>
      ) : (
        list
      )}
      {writing && <RecruitFormModal onClose={() => setWriting(false)} />}
    </div>
  )
}

function Recruits({ tab }: { tab: RecruitListTab }) {
  const [page, setPage] = usePageParam('page')
  const [selectedView, selectView] = useHoldListView()
  // 보기는 내 모집글에만 있다(공개 모집에는 보류 상태 글이 나오지 않는다).
  const view = tab === 'mine' ? selectedView : 'active'
  // 검색 조건은 공개 모집(모집 중)에만 있다. 내 모집글은 조건 없이 최신순이다.
  const { search, update, clear } = useRecruitSearch()
  const searchable = tab === 'open'
  const filtered = searchable && hasRecruitConditions(search)
  // 조건을 모두 지우면 검색 막대를 새로 그려 입력 중이던 값까지 비운다
  const [cleared, setCleared] = useState(0)
  const clearAll = () => {
    clear()
    setCleared((n) => n + 1)
  }
  // 보류 확인 중인 글이 보이는 동안 목록이 스스로 다시 부른다(recruitsQuery).
  const query = useQuery(recruitsQuery(tab, page, view, search))
  const { data, error, isPending, isPlaceholderData, refetch } = query
  const moving = useClampPage(page, query, setPage)
  const { data: me } = useQuery(meQuery)

  return (
    <>
      {searchable && (
        <RecruitSearchBar
          key={cleared}
          search={search}
          update={update}
          onClear={clearAll}
          focusKeyword={cleared > 0}
        />
      )}
      {tab === 'mine' && (
        <div className="toolbar">
          <span className="fine">
            {view === 'failed'
              ? 'HP 보류에 실패해 등록되지 않은 모집글이에요.'
              : 'HP 보류 확인 중인 글은 확인이 끝나면 자동으로 바뀌어요.'}
          </span>
          <HoldListViewSelect value={view} onChange={selectView} />
        </div>
      )}
      {isPending || moving ? (
        <CardSkeleton />
      ) : error ? (
        searchable && isApiError(error) && error.status === 400 ? (
          <EmptyState
            title="검색 조건을 확인해 주세요"
            art="search"
            action={
              <button type="button" className="btn" onClick={clearAll}>
                조건 지우기
              </button>
            }
          >
            {error.message}
          </EmptyState>
        ) : (
          <LoadError error={error} retry={refetch} />
        )
      ) : data.content.length === 0 ? (
        tab === 'mine' && view === 'failed' ? (
          <EmptyState title="등록되지 않은 모집글이 없어요">
            HP 보류에 실패한 모집글이 여기에 보여요.
          </EmptyState>
        ) : tab === 'mine' ? (
          <EmptyState title="아직 올린 모집글이 없어요">
            모집글을 올리면 여러 게스트의 지원을 받을 수 있어요.
          </EmptyState>
        ) : filtered ? (
          <EmptyState
            title="조건에 맞는 모집글이 없어요"
            art="search"
            action={
              <button type="button" className="btn" onClick={clearAll}>
                조건 지우기
              </button>
            }
          >
            검색어나 날짜·출연료 조건을 바꿔 보세요.
          </EmptyState>
        ) : (
          <EmptyState title="지금 모집 중인 글이 없어요">
            새 모집글이 올라오면 여기에 보여요.
          </EmptyState>
        )
      ) : (
        <>
          {searchable && (
            <div className={styles.resultHead}>
              <h2 className={styles.head}>
                {filtered ? '검색 결과' : '모집 중인 글'}
              </h2>
              <span className={styles.count}>
                {formatNumber(data.page.totalElements)}개
              </span>
            </div>
          )}
          <div
            className={
              isPlaceholderData
                ? `rec-list ${styles.list} ${styles.stale}`
                : `rec-list ${styles.list}`
            }
            aria-busy={isPlaceholderData || undefined}
          >
            {data.content.map((recruit) => (
              <RecruitCard
                key={recruit.id}
                recruit={recruit}
                mine={recruit.hostId === me?.id}
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
    </>
  )
}

function RecruitCard({
  recruit,
  mine,
}: {
  recruit: RecruitSummary
  mine: boolean
}) {
  return (
    <Link to={`/recruits/${recruit.id}`} className={`rec ${styles.card}`}>
      <AirDate value={recruit.scheduledAt} />
      <div className={styles.body}>
        <div className={`rec-title ${styles.title}`}>
          <RecruitDeadlinePill recruit={recruit} />
          <span className={styles.titleText}>{recruit.title}</span>
        </div>
        <div className="rec-meta">
          {mine ? (
            <span className={styles.mine}>내 모집</span>
          ) : (
            <MemberChip memberId={recruit.hostId} size={20} />
          )}
          <span>방송 {formatDateTime(recruit.scheduledAt)}</span>
          <span>마감 {formatDateTime(recruit.recruitDeadline)}</span>
          <span>지원 {recruit.applicantCount}명</span>
        </div>
      </div>
      <div className={`rec-fee ${styles.fee}`}>
        <span className={styles.eyebrow}>1인 출연료</span>
        <b className="num">{formatNumber(recruit.feePerPerson)} HP</b>
        <RecruitSeats
          selected={recruit.selectedCount}
          total={recruit.recruitCount}
        />
      </div>
    </Link>
  )
}

function MyApplications() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(myApplicationsQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)

  if (isPending || moving) return <CardSkeleton />
  if (error) return <LoadError error={error} retry={refetch} />
  if (data.content.length === 0)
    return (
      <EmptyState
        title="아직 지원한 모집이 없어요"
        action={
          <Link className="btn primary" to="/recruits">
            모집 중인 글 보기
          </Link>
        }
      >
        모집 중 탭에서 마음에 드는 모집글에 지원해 보세요.
      </EmptyState>
    )
  return (
    <>
      <section className="panel">
        <div className="rows">
          {data.content.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      </section>
      <Pager
        page={data.page.number}
        totalPages={data.page.totalPages}
        onChange={setPage}
      />
    </>
  )
}

function ApplicationRow({ application }: { application: Application }) {
  return (
    <div className={`row-item ${styles.appRow}`}>
      <AirDate value={application.recruitScheduledAt} />
      <div className="row-main">
        <Link
          className="row-title link"
          to={`/recruits/${application.recruitId}`}
        >
          {application.recruitTitle}
        </Link>
        <span className="fine">
          방송 {formatDateTime(application.recruitScheduledAt)} ·{' '}
          {formatDateTime(application.createdAt)} 지원
        </span>
      </div>
      <div className="row-actions">
        <RecruitStatusOnlyPill status={application.recruitStatus} />
        <ApplicationStatusPill status={application.status} />
      </div>
    </div>
  )
}
