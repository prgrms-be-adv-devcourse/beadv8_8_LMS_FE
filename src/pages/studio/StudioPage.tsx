import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { myLecturesQuery, salesQuery } from '@/entities/lecture/api'
import { isRefunded } from '@/entities/lecture/sale'
import type { MyLecture, Sale } from '@/entities/lecture/types'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { MyLectureStatusPill } from '@/entities/lecture/ui/MyLectureStatusPill'
import { SaleStatusPill } from '@/entities/lecture/ui/SaleStatusPill'
import { DeleteLectureModal } from '@/features/lecture-delete/DeleteLectureModal'
import type { PagedModel } from '@/shared/api/types'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/** URL의 1부터 세는 페이지 번호(key)를 0부터 세는 값으로 읽고 쓴다. 다른 검색어는 그대로 둔다. */
function usePageParam(key: string) {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get(key) ?? 1)
  const page =
    Number.isSafeInteger(requested) && requested > 0 ? requested - 1 : 0
  const setPage = (next: number, { replace = false } = {}) =>
    setParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next > 0) params.set(key, String(next + 1))
        else params.delete(key)
        return params
      },
      { replace },
    )
  return [page, setPage] as const
}

type PageQuery = { data?: PagedModel<unknown>; isPlaceholderData: boolean }

/**
 * URL의 페이지가 마지막 페이지를 넘으면(목록이 줄었거나 직접 입력) 마지막 페이지로 옮긴다.
 * 옮기는 동안에는 true다. 그동안 빈 목록 대신 불러오는 중으로 보여 준다.
 */
function useClampPage(
  page: number,
  { data, isPlaceholderData }: PageQuery,
  setPage: ReturnType<typeof usePageParam>[1],
) {
  const last =
    data && !isPlaceholderData
      ? Math.max(data.page.totalPages - 1, 0)
      : undefined
  const outOfRange = last !== undefined && page > last
  useEffect(() => {
    if (outOfRange) setPage(last, { replace: true })
  }, [outOfRange, last, setPage])
  return outOfRange || (isPlaceholderData && data?.content.length === 0)
}

export function StudioPage() {
  return (
    <div className="page">
      <PageHead
        title="강의 판매"
        lede="등록한 강의는 관리자 검수를 통과하면 공개돼요. 판매 수익은 구매일 다음 날부터 30일이 지나면 지급돼요."
        actions={
          <Link className="btn primary" to="/studio/lectures/new">
            강의 등록
          </Link>
        }
      />
      <MyLectures />
      <Sales />
    </div>
  )
}

function MyLectures() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(myLecturesQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)
  const [deleting, setDeleting] = useState<MyLecture | null>(null)

  return (
    <section className="panel">
      <h2>내 강의</h2>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title="등록한 강의가 없어요" />
      ) : (
        <>
          <div className="rows">
            {data.content.map((lecture) => (
              <MyLectureRow
                key={lecture.lectureId}
                lecture={lecture}
                onDelete={() => setDeleting(lecture)}
              />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
          <p className="fine">
            삭제하면 목록 노출과 신규 판매만 멈추고, 기존 구매자는 계속 볼 수
            있어요.
          </p>
        </>
      )}
      {deleting && (
        <DeleteLectureModal
          lecture={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  )
}

function MyLectureRow({
  lecture,
  onDelete,
}: {
  lecture: MyLecture
  onDelete: () => void
}) {
  return (
    <div
      className={lecture.deleted ? 'row-item off' : 'row-item'}
      style={{ alignItems: 'flex-start' }}
    >
      <LectureThumb
        lectureId={lecture.lectureId}
        title={lecture.title}
        thumbnailUrl={lecture.thumbnailUrl}
        size="sm"
      />
      <div className="row-main">
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            className="row-title"
            to={`/lectures/${lecture.lectureId}`}
            style={{ textDecoration: 'none' }}
          >
            {lecture.title}
          </Link>
          <MyLectureStatusPill lecture={lecture} />
        </div>
        <span className="fine num">{formatNumber(lecture.priceHp)} HP</span>
        {lecture.status === 'REJECTED' && lecture.rejectionReason && (
          <p className="app-note" style={{ color: 'var(--bad)' }}>
            반려 사유: {lecture.rejectionReason}
          </p>
        )}
      </div>
      {!lecture.deleted && (
        <div className="row-actions">
          <Link
            className="btn sm"
            to={`/studio/lectures/${lecture.lectureId}/edit`}
          >
            {lecture.status === 'REJECTED' ? '수정 후 재검수' : '수정'}
          </Link>
          <button type="button" className="btn ghost sm" onClick={onDelete}>
            삭제
          </button>
        </div>
      )}
    </div>
  )
}

function Sales() {
  const [page, setPage] = usePageParam('salesPage')
  const query = useQuery(salesQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)

  return (
    <section className="panel">
      <h2>판매 내역</h2>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 판매 내역이 없어요" />
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>구매일</th>
                  <th>강의</th>
                  <th className="r">금액</th>
                  <th>지급 예정일</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((sale) => (
                  <SaleRow key={sale.orderItemId} sale={sale} />
                ))}
              </tbody>
            </table>
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

function SaleRow({ sale }: { sale: Sale }) {
  return (
    <tr>
      <td>{formatDate(sale.purchasedAt)}</td>
      <td>{sale.lectureTitle}</td>
      <td className="r num">{formatNumber(sale.priceHp)}</td>
      <td>{isRefunded(sale) ? '—' : formatDate(sale.payoutScheduledAt)}</td>
      <td>
        <SaleStatusPill sale={sale} />
      </td>
    </tr>
  )
}
