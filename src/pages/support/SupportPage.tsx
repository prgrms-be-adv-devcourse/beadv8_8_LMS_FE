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

function MyInquiries() {
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<InquirySort>('LATEST')
  const [page, setPage] = useState(0)
  const { data, error, isPending, refetch } = useQuery(
    myInquiriesQuery({ keyword, sort, page }),
  )

  const search = (e: FormEvent) => {
    e.preventDefault()
    setKeyword(draft.trim())
    setPage(0)
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
          onChange={(e) => {
            setSort(e.target.value as InquirySort)
            setPage(0)
          }}
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
            onChange={setPage}
          />
        </>
      )}
    </aside>
  )
}
