import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  HOLD_PENDING_PARAM,
  myApplicationsQuery,
  recruitsQuery,
} from '@/entities/appearance/api'
import type {
  Application,
  RecruitListTab,
  RecruitSummary,
} from '@/entities/appearance/types'
import { ApplicationStatusPill } from '@/entities/appearance/ui/ApplicationStatusPill'
import {
  RecruitDeadlinePill,
  RecruitStatusOnlyPill,
} from '@/entities/appearance/ui/RecruitStatusPill'
import { RecruitSeats } from '@/entities/appearance/ui/RecruitSeats'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { RecruitFormModal } from '@/features/recruit/RecruitFormModal'
import { meQuery } from '@/shared/auth/me'
import { INFLUENCER } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import {
  HOLD_POLL_INTERVAL_MS,
  useLimitedPolling,
} from '@/shared/lib/useLimitedPolling'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { Tabs } from '@/shared/ui/Tabs'

type Tab = RecruitListTab | 'applications'

const TABS: { value: Tab; label: string }[] = [
  { value: 'open', label: '모집 중' },
  { value: 'mine', label: '내 모집글' },
  { value: 'applications', label: '내 지원' },
]

export function RecruitsPage() {
  const viewer = useViewer()
  const influencer = viewer !== undefined && INFLUENCER.includes(viewer)
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  // 내 모집글·내 지원은 인플루언서만 쓴다. 다른 역할은 주소에 있어도 모집 중을 보여 준다.
  const tab: Tab =
    influencer && (requested === 'mine' || requested === 'applications')
      ? requested
      : 'open'
  const [writing, setWriting] = useState(false)

  const selectTab = (next: Tab) =>
    setParams(next === 'open' ? {} : { tab: next })
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
  const [params, setParams] = useSearchParams()
  const [page, setPage] = usePageParam('page')
  const holdPending = tab === 'mine' && params.get(HOLD_PENDING_PARAM) === '1'
  const polling = useLimitedPolling(holdPending)
  const query = useQuery({
    ...recruitsQuery(tab, page),
    refetchInterval: polling ? HOLD_POLL_INTERVAL_MS : false,
  })
  const { data, error, isPending, refetch, isFetching } = query
  const moving = useClampPage(page, query, setPage)
  const { data: me } = useQuery(meQuery)

  const dismissHoldPending = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(HOLD_PENDING_PARAM)
      return next
    })

  return (
    <>
      {holdPending && (
        <div className="notice warn" role="status">
          <span>
            HP 보류를 확인하는 중이에요.
            {polling
              ? ' 잠시 뒤 내 모집글에 나타나요.'
              : ' 아직 목록에 없으면 새로고침해 보세요. 잔액이 부족했다면 모집글이 올라가지 않아요.'}
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
        tab === 'mine' ? (
          <EmptyState title="아직 올린 모집글이 없어요">
            모집글을 올리면 여러 게스트의 지원을 받을 수 있어요.
          </EmptyState>
        ) : (
          <EmptyState title="지금 모집 중인 글이 없어요">
            새 모집글이 올라오면 여기에 보여요.
          </EmptyState>
        )
      ) : (
        <>
          <div className="rec-list">
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
    <Link to={`/recruits/${recruit.id}`} className="rec">
      <div style={{ minWidth: 0 }}>
        <div className="rec-title">
          <RecruitDeadlinePill recruit={recruit} />
          {recruit.title}
        </div>
        <div className="rec-meta">
          {mine ? (
            <span>내 모집</span>
          ) : (
            <MemberChip memberId={recruit.hostId} size={20} />
          )}
          <span>방송 {formatDateTime(recruit.scheduledAt)}</span>
          <span>마감 {formatDateTime(recruit.recruitDeadline)}</span>
          <span>지원 {recruit.applicantCount}명</span>
        </div>
      </div>
      <div className="rec-fee">
        <b>{formatNumber(recruit.feePerPerson)} HP</b>
        <span>1인 출연료</span>
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

  if (isPending || moving) return <Loading />
  if (error) return <LoadError error={error} retry={refetch} />
  if (data.content.length === 0)
    return (
      <EmptyState title="아직 지원한 모집이 없어요">
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
    <div className="row-item">
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
