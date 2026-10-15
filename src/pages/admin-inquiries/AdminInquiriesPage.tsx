import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { adminInquiriesQuery } from '@/entities/inquiry/api'
import { STATUS_LABEL } from '@/entities/inquiry/category'
import type { InquirySort, InquiryStatus } from '@/entities/inquiry/types'
import { InquiryList } from '@/entities/inquiry/ui/InquiryList'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

const STATUSES: (InquiryStatus | undefined)[] = [
  undefined,
  'WAITING',
  'ANSWERED',
]

/** 상태·정렬·페이지는 URL에 둔다(?status=&sort=&page=, page는 1부터). 기본은 답변 대기 · 오래된 순. */
function useListParams() {
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const status: InquiryStatus | undefined =
    statusParam === 'ALL'
      ? undefined
      : statusParam === 'ANSWERED'
        ? 'ANSWERED'
        : 'WAITING'
  const sort: InquirySort =
    params.get('sort') === 'LATEST' ? 'LATEST' : 'OLDEST'
  const page = Math.max(0, Number(params.get('page') ?? '1') - 1) || 0

  const update = (
    next: Partial<{
      status: InquiryStatus | undefined
      sort: InquirySort
      page: number
    }>,
  ) => {
    const merged = { status, sort, page, ...next }
    const search = new URLSearchParams()
    if (merged.status !== 'WAITING')
      search.set('status', merged.status ?? 'ALL')
    if (merged.sort !== 'OLDEST') search.set('sort', merged.sort)
    if (merged.page > 0) search.set('page', String(merged.page + 1))
    setParams(search)
  }
  return { status, sort, page, update }
}

export function AdminInquiriesPage() {
  const { status, sort, page, update } = useListParams()
  const { data, error, isPending, refetch } = useQuery(
    adminInquiriesQuery({ status, sort, page }),
  )

  return (
    <div className="page">
      <PageHead
        title="문의 답변"
        lede="회원 문의에 답하고, 강의 내용 다름 이의 제기를 판단해요. 답변은 문의한 회원의 고객센터에 보여요."
      />
      <div className="toolbar">
        <div
          role="group"
          aria-label="답변 상태"
          style={{ display: 'flex', gap: 6 }}
        >
          {STATUSES.map((s) => (
            <button
              key={s ?? 'ALL'}
              type="button"
              className={status === s ? 'btn sm primary' : 'btn sm'}
              aria-pressed={status === s}
              onClick={() => update({ status: s, page: 0 })}
            >
              {s ? STATUS_LABEL[s] : '전체'}
            </button>
          ))}
        </div>
        <select
          className="select sm"
          value={sort}
          onChange={(e) =>
            update({ sort: e.target.value as InquirySort, page: 0 })
          }
          aria-label="정렬"
        >
          <option value="OLDEST">오래된 순</option>
          <option value="LATEST">최신순</option>
        </select>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState
          title={
            status === 'WAITING' ? '답변 대기 문의가 없어요' : '문의가 없어요'
          }
        />
      ) : (
        <section className="panel">
          <InquiryList
            inquiries={data.content}
            to={(id) => `/admin/inquiries/${id}`}
            showUser
          />
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={(p) => update({ page: p })}
          />
        </section>
      )}
    </div>
  )
}
