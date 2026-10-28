import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { lecturesQuery } from '@/entities/lecture/api'
import {
  LECTURE_SORT_LABEL,
  type LectureSort,
  type LectureSummary,
} from '@/entities/lecture/types'
import { LectureCard as BaseLectureCard } from '@/entities/lecture/ui/LectureCard'
import {
  useBuyerState,
  type BuyerState,
} from '@/features/purchase/useBuyerState'
import { useViewer } from '@/shared/auth/session'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { openLoginModal } from '@/shared/ui/loginModal'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './LecturesPage.module.css'

const SORTS = Object.keys(LECTURE_SORT_LABEL) as LectureSort[]

/** 검색어·정렬은 URL에 둔다(?keyword=&sort=). 바꾸면 첫 페이지로 간다. 페이지는 usePageParam이 맡는다. */
function useListParams() {
  const [params, setParams] = useSearchParams()
  const sortParam = params.get('sort') as LectureSort | null
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'LATEST'
  const keyword = params.get('keyword') ?? ''

  const update = (next: Partial<{ keyword: string; sort: LectureSort }>) => {
    const merged = { keyword, sort, ...next }
    const search = new URLSearchParams()
    if (merged.keyword) search.set('keyword', merged.keyword)
    if (merged.sort !== 'LATEST') search.set('sort', merged.sort)
    setParams(search)
  }
  return { keyword, sort, update }
}

export function LecturesPage() {
  const viewer = useViewer()
  const buyer = useBuyerState()
  const { keyword, sort, update } = useListParams()
  const [page, setPage] = usePageParam('page')
  const [draft, setDraft] = useState(keyword)
  const query = useQuery(lecturesQuery({ keyword, sort, page }))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  const search = (e: FormEvent) => {
    e.preventDefault()
    update({ keyword: draft.trim() })
  }

  return (
    <div className="page">
      <PageHead
        title="강의"
        lede="인증된 인플루언서가 직접 만든 방송 강의예요. 구매일 다음 날부터 7일 안에, 재생하기 전이면 구매 취소할 수 있어요."
      />
      {viewer === 'GUEST' && (
        <div className="notice">
          비회원은 강의 목록만 볼 수 있어요.
          <button
            type="button"
            className="link"
            onClick={() => openLoginModal()}
          >
            로그인
          </button>
        </div>
      )}
      <div className="toolbar">
        <form className={styles.search} role="search" onSubmit={search}>
          <input
            className="input"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="강의 제목으로 찾기"
            aria-label="강의 검색"
          />
          <button type="submit" className="btn">
            검색
          </button>
        </form>
        <select
          className="select sm"
          value={sort}
          onChange={(e) => update({ sort: e.target.value as LectureSort })}
          aria-label="정렬"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {LECTURE_SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState
          title={
            keyword ? '찾는 강의가 없어요' : '아직 판매 중인 강의가 없어요'
          }
        >
          {keyword && '다른 검색어로 찾아보세요.'}
        </EmptyState>
      ) : (
        <>
          <div className={styles.grid}>
            {data.content.map((lecture) => (
              <LectureCard
                key={lecture.lectureId}
                lecture={lecture}
                buyer={buyer}
                guest={viewer === 'GUEST'}
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
    </div>
  )
}

/** 보유 중·장바구니·내 강의 표시를 붙인 강의 카드 */
function LectureCard({
  lecture,
  buyer,
  guest,
}: {
  lecture: LectureSummary
  buyer: BuyerState
  guest: boolean
}) {
  const owned = buyer.owned.has(lecture.lectureId)
  const inCart = buyer.inCart.has(lecture.lectureId)
  const mine = lecture.sellerUserId === buyer.myUserId
  return (
    <BaseLectureCard
      lecture={lecture}
      guest={guest}
      flags={
        (owned || inCart || mine) && (
          <>
            {owned && <span className="pill ok">보유 중</span>}
            {inCart && <span className="pill info">장바구니</span>}
            {mine && <span className="pill mute">내 강의</span>}
          </>
        )
      }
    />
  )
}
