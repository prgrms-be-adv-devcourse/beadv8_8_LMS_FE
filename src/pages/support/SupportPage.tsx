import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { myInquiriesQuery } from '@/entities/inquiry/api'
import { isInquiryCategory } from '@/entities/inquiry/category'
import type { InquirySort } from '@/entities/inquiry/types'
import { InquiryList } from '@/entities/inquiry/ui/InquiryList'
import { NewInquiryForm } from '@/features/inquiry/NewInquiryForm'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/**
 * 고객센터. 다른 화면에서 ?category=LECTURE_CONTENT_DISPUTE&orderItemId=12 로 보내면 새 문의를 미리 채운다.
 */
export function SupportPage() {
  const [params] = useSearchParams()
  const category = params.get('category')
  const orderItemId = Number(params.get('orderItemId')) || undefined

  return (
    <div className="page">
      <PageHead
        title="고객센터"
        lede="노쇼 신고, 강의 내용 다름 이의 제기, 서비스 문의를 받아요. 관리자가 확인한 뒤 답변해요."
      />
      <div className="split">
        <NewInquiryForm
          initialCategory={isInquiryCategory(category) ? category : undefined}
          initialOrderItemId={orderItemId}
        />
        <MyInquiries />
      </div>
    </div>
  )
}

/**
 * 내 문의 검색어·정렬·페이지는 URL에 둔다(?q=&sort=&page=, page는 1부터).
 * 상세에서 돌아와도 보던 목록이 남는다. 새 문의 미리 채우기 값(category·orderItemId)은 건드리지 않는다.
 */
function useListParams() {
  const [params, setParams] = useSearchParams()
  const keyword = params.get('q') ?? ''
  const sort: InquirySort =
    params.get('sort') === 'OLDEST' ? 'OLDEST' : 'LATEST'
  const page = Math.max(0, Number(params.get('page') ?? '1') - 1) || 0

  const update = (
    next: Partial<{ keyword: string; sort: InquirySort; page: number }>,
  ) => {
    const merged = { keyword, sort, page, ...next }
    setParams((prev) => {
      const search = new URLSearchParams(prev)
      if (merged.keyword) search.set('q', merged.keyword)
      else search.delete('q')
      if (merged.sort !== 'LATEST') search.set('sort', merged.sort)
      else search.delete('sort')
      if (merged.page > 0) search.set('page', String(merged.page + 1))
      else search.delete('page')
      return search
    })
  }
  return { keyword, sort, page, update }
}

function MyInquiries() {
  const { keyword, sort, page, update } = useListParams()
  const [draft, setDraft] = useState(keyword)
  const { data, error, isPending, refetch } = useQuery(
    myInquiriesQuery({ keyword, sort, page }),
  )

  const search = (e: FormEvent) => {
    e.preventDefault()
    update({ keyword: draft.trim(), page: 0 })
  }

  return (
    <aside className="panel">
      <h2>내 문의</h2>
      <div className="toolbar">
        <form
          role="search"
          onSubmit={search}
          style={{ display: 'flex', gap: 6 }}
        >
          <input
            className="input"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="제목으로 찾기"
            aria-label="내 문의 검색"
          />
          <button type="submit" className="btn sm">
            검색
          </button>
        </form>
        <select
          className="select sm"
          value={sort}
          onChange={(e) =>
            update({ sort: e.target.value as InquirySort, page: 0 })
          }
          aria-label="정렬"
        >
          <option value="LATEST">최신순</option>
          <option value="OLDEST">오래된 순</option>
        </select>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState
          title={keyword ? '찾는 문의가 없어요' : '아직 남긴 문의가 없어요'}
        >
          {keyword
            ? '다른 검색어로 찾아보세요.'
            : '궁금한 점이나 불편한 점을 남겨 주세요.'}
        </EmptyState>
      ) : (
        <>
          <InquiryList
            inquiries={data.content}
            to={(id) => `/support/inquiries/${id}`}
          />
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={(p) => update({ page: p })}
          />
        </>
      )}
    </aside>
  )
}
