import { useQuery } from '@tanstack/react-query'
import { useRef, type FormEvent, type ReactNode } from 'react'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { lecturesQuery } from '@/entities/lecture/api'
import {
  LECTURE_BROWSE_SORTS,
  listSortOf,
  normalizeKeyword,
  parseBrowseSort,
  sortLabel,
} from '@/entities/lecture/search'
import type { LectureBrowseSort } from '@/entities/lecture/types'
import { LectureCard } from '@/entities/lecture/ui/LectureCard'
import {
  LectureGrid,
  LectureGridSkeleton,
} from '@/entities/lecture/ui/LectureGrid'
import { LectureKeywordBox } from '@/features/lecture-search/LectureKeywordBox'
import { LectureRecommendWidget } from '@/features/recommend-widget/LectureRecommendWidget'
import { LectureSearchResults } from '@/features/lecture-search/LectureSearchResults'
import { useKeywordInput } from '@/features/lecture-search/useKeywordInput'
import {
  useBuyerState,
  type BuyerState,
} from '@/features/purchase/useBuyerState'
import { useViewer } from '@/shared/auth/session'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { openLoginModal } from '@/shared/ui/loginModal'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './LecturesPage.module.css'

/**
 * 검색어·정렬은 URL에 둔다(?keyword=&sort=). 바꾸면 첫 페이지로 간다. 페이지는 usePageParam이 맡는다.
 * 정렬 값은 강의 목록 API 값(LATEST 등)으로 적고, 기본은 적지 않는다.
 * 검색어 직후 정렬을 바꿔도 검색어가 사라지지 않게 useMergedSearchParams로 합친다.
 */
function useBrowseParams() {
  const [params, merge] = useMergedSearchParams()
  const sort = parseBrowseSort(params.get('sort'))
  const keyword = normalizeKeyword(params.get('keyword') ?? '')

  const update = (
    next: Partial<{ keyword: string; sort: LectureBrowseSort }>,
    { replace = false } = {},
  ) =>
    merge(
      (current) => {
        const merged = {
          keyword: normalizeKeyword(current.get('keyword') ?? ''),
          sort: parseBrowseSort(current.get('sort')),
          ...next,
        }
        const search = new URLSearchParams()
        if (merged.keyword) search.set('keyword', merged.keyword)
        if (merged.sort !== 'DEFAULT') search.set('sort', merged.sort)
        return search
      },
      { replace },
    )
  return { keyword, sort, update }
}

/** 검색어가 없으면 강의 목록 API, 있으면 강의 검색 API로 보인다 */
export function LecturesPage() {
  const viewer = useViewer()
  const buyer = useBuyerState()
  const guest = viewer === 'GUEST'
  const { keyword, sort, update } = useBrowseParams()
  const [page, setPage] = usePageParam('page')
  // 검색어를 고쳐 가는 동안(검색어 → 다른 검색어)은 방문 기록을 하나만 남긴다
  const { draft, setDraft, submit, searchFor } = useKeywordInput(
    keyword,
    (next) =>
      update({ keyword: next }, { replace: keyword !== '' && next !== '' }),
  )
  const flagsOf = (lecture: CardLecture) => buyerFlags(lecture, buyer)
  // 페이지를 넘기면 맨 아래 페이지 버튼에 머물지 않고 검색 줄(결과 위)로 올라간다
  const toolbar = useRef<HTMLDivElement>(null)
  const turnPage = (next: number) => {
    setPage(next)
    const reduce =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    toolbar.current?.scrollIntoView?.({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    })
  }

  const search = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  return (
    <div className="page">
      <PageHead
        title="강의"
        lede="인증된 인플루언서가 직접 만든 방송 강의예요. 구매일 다음 날부터 7일 안에, 재생하기 전이면 구매 취소할 수 있어요."
      />
      {guest && (
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
      {/* 둘러볼 때만 추천 강의 띠를 둔다(검색 중에는 숨긴다) */}
      {!keyword && (
        <LectureRecommendWidget signedIn={viewer !== undefined && !guest} />
      )}
      <div ref={toolbar} className={`toolbar ${styles.toolbar}`}>
        <form className={styles.search} role="search" onSubmit={search}>
          <LectureKeywordBox
            value={draft}
            onChange={setDraft}
            guest={guest}
            onSearchTitle={searchFor}
          />
          <button type="submit" className="btn primary">
            검색
          </button>
        </form>
        <div className={styles.sort}>
          {keyword && sort === 'RATING' && (
            <span className="fine">리뷰 수를 함께 반영한 순서예요</span>
          )}
          <span className={styles.eyebrow} aria-hidden="true">
            SORT
          </span>
          <select
            className="select sm"
            value={sort}
            onChange={(e) =>
              update({ sort: e.target.value as LectureBrowseSort })
            }
            aria-label="정렬"
          >
            {LECTURE_BROWSE_SORTS.map((s) => (
              <option key={s} value={s}>
                {sortLabel(s, keyword !== '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {keyword ? (
        <LectureSearchResults
          keyword={keyword}
          sort={sort}
          page={page}
          setPage={setPage}
          onPageTurn={turnPage}
          onShowAll={() => update({ keyword: '' })}
          guest={guest}
          flagsOf={flagsOf}
        />
      ) : (
        <LectureList
          sort={sort}
          page={page}
          setPage={setPage}
          onPageTurn={turnPage}
          guest={guest}
          flagsOf={flagsOf}
        />
      )}
    </div>
  )
}

/** 검색어가 없을 때의 기본 목록(썸네일 포함) */
function LectureList({
  sort,
  page,
  setPage,
  onPageTurn,
  guest,
  flagsOf,
}: {
  sort: LectureBrowseSort
  page: number
  setPage: ReturnType<typeof usePageParam>[1]
  onPageTurn: (page: number) => void
  guest: boolean
  flagsOf: (lecture: CardLecture) => ReactNode
}) {
  const query = useQuery(lecturesQuery({ sort: listSortOf(sort), page }))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  if (isPending || moving) return <LectureGridSkeleton />
  if (error) return <LoadError error={error} retry={refetch} />
  if (data.content.length === 0) {
    return <EmptyState title="아직 판매 중인 강의가 없어요" />
  }
  return (
    <>
      <div className={styles.resultHead}>
        <h2 className={styles.head}>전체 강의</h2>
        <span className={styles.count}>
          {formatNumber(data.page.totalElements)}개
        </span>
      </div>
      <LectureGrid>
        {data.content.map((lecture) => (
          <LectureCard
            key={lecture.lectureId}
            lecture={lecture}
            guest={guest}
            flags={flagsOf(lecture)}
          />
        ))}
      </LectureGrid>
      <Pager
        page={data.page.number}
        totalPages={data.page.totalPages}
        onChange={onPageTurn}
      />
    </>
  )
}

type CardLecture = { lectureId: number; sellerUserId: number }

/** 보유 중·장바구니·내가 판매 표시. 해당하는 것이 없으면 null이다 */
function buyerFlags(lecture: CardLecture, buyer: BuyerState) {
  const owned = buyer.owned.has(lecture.lectureId)
  const inCart = buyer.inCart.has(lecture.lectureId)
  const mine = lecture.sellerUserId === buyer.myUserId
  if (!owned && !inCart && !mine) return null
  return (
    <>
      {owned && <span className="pill ok">보유 중</span>}
      {inCart && <span className="pill info">장바구니</span>}
      {mine && <span className="pill mute">내가 판매</span>}
    </>
  )
}
