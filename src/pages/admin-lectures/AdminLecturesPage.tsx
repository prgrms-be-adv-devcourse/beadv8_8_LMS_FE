import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { inspectionsQuery } from '@/entities/lecture/api'
import type { LectureStatus } from '@/entities/lecture/types'
import { MyLectureStatusPill } from '@/entities/lecture/ui/MyLectureStatusPill'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

const PENDING = 'PENDING_INSPECTION'

const TABS: { status: LectureStatus; label: string; empty: string }[] = [
  { status: PENDING, label: '검수 대기', empty: '검수 대기 강의가 없어요' },
  { status: 'REJECTED', label: '반려', empty: '반려한 강의가 없어요' },
  { status: 'ON_SALE', label: '판매 중', empty: '판매 중인 강의가 없어요' },
]

/** 상태는 URL ?status=에 둔다. 없거나 모르는 값이면 검수 대기다. 바꾸면 첫 페이지로 간다. */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const status =
    TABS.find((t) => t.status === params.get('status'))?.status ?? PENDING
  const setStatus = (next: LectureStatus) => {
    const search = new URLSearchParams()
    if (next !== PENDING) search.set('status', next)
    setParams(search)
  }
  return [status, setStatus] as const
}

export function AdminLecturesPage() {
  const [status, setStatus] = useStatusParam()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(inspectionsQuery({ status, page }))
  const moving = useClampPage(page, query, setPage)
  // 머리글 건수는 탭과 관계없이 검수 대기 기준이다. 검수 대기 첫 페이지와 같은 쿼리를 쓴다.
  const pending = useQuery(inspectionsQuery({ status: PENDING, page: 0 }))
  const pendingCount = pending.data?.page.totalElements
  const { data, error, isPending, refetch } = query
  const tab = TABS.find((t) => t.status === status) ?? TABS[0]

  return (
    <div className="page">
      <PageHead
        title="강의 검수"
        lede="승인하면 공개·판매가 시작돼요. 반려하면 사유를 남기고, 판매자가 고쳐서 다시 신청해요."
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
        <div
          role="group"
          aria-label="검수 상태"
          style={{ display: 'flex', gap: 6 }}
        >
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
          <div>
            {data.content.map((lecture) => (
              <div key={lecture.lectureId} className="q-item">
                <div className="row-main">
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <b>{lecture.title}</b>
                    <MyLectureStatusPill
                      lecture={{ status: lecture.status, deleted: false }}
                    />
                  </div>
                  <span className="fine">
                    {lecture.sellerNickname} ·{' '}
                    {formatDate(lecture.inspectionRequestedAt)} 신청 ·{' '}
                    {formatNumber(lecture.priceHp)} HP
                  </span>
                </div>
                <Link
                  className={
                    lecture.status === PENDING ? 'btn primary sm' : 'btn sm'
                  }
                  to={`/admin/lectures/${lecture.lectureId}`}
                >
                  {lecture.status === PENDING ? '검수하기' : '보기'}
                </Link>
              </div>
            ))}
          </div>
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
