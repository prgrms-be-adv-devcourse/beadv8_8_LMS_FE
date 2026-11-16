import { useQuery } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { lecturesQuery } from '@/entities/lecture/api'
import {
  LECTURE_BROWSE_SORTS,
  LECTURE_KEYWORD_MAX,
  listSortOf,
  normalizeKeyword,
  parseBrowseSort,
  sortLabel,
} from '@/entities/lecture/search'
import type { LectureBrowseSort } from '@/entities/lecture/types'
import { LectureCard } from '@/entities/lecture/ui/LectureCard'
import { LectureSearchResults } from '@/features/lecture-search/LectureSearchResults'
import { useKeywordInput } from '@/features/lecture-search/useKeywordInput'
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

/**
 * 검색어·정렬은 URL에 둔다(?keyword=&sort=). 바꾸면 첫 페이지로 간다. 페이지는 usePageParam이 맡는다.
 * 정렬 값은 강의 목록 API 값(LATEST 등)으로 적고, 기본은 적지 않는다.
 * 바꿀 때는 마지막으로 보낸 값 위에 합친다. 앞선 이동이 loader를 기다리는 사이 다른 값을 바꾸면
 * 화면의 값(옛 URL)으로 합쳐 앞서 바꾼 값이 사라지기 때문이다. URL이 실제로 바뀌면 그 값을 기준으로 삼는다.
 */
function useBrowseParams() {
  const [params, setParams] = useSearchParams()
  const sort = parseBrowseSort(params.get('sort'))
  const keyword = normalizeKeyword(params.get('keyword') ?? '')
  const query = params.toString()
  const latest = useRef(query)
  useEffect(() => {
    latest.current = query
  }, [query])

  const update = (
    next: Partial<{ keyword: string; sort: LectureBrowseSort }>,
    { replace = false } = {},
  ) => {
    const sent = new URLSearchParams(latest.current)
    const merged = {
      keyword: normalizeKeyword(sent.get('keyword') ?? ''),
      sort: parseBrowseSort(sent.get('sort')),
      ...next,
    }
    const search = new URLSearchParams()
    if (merged.keyword) search.set('keyword', merged.keyword)
    if (merged.sort !== 'DEFAULT') search.set('sort', merged.sort)
    latest.current = search.toString()
    setParams(search, { replace })
  }
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
  const { draft, setDraft, submit } = useKeywordInput(keyword, (next) =>
    update({ keyword: next }, { replace: keyword !== '' && next !== '' }),
  )
  const flagsOf = (lecture: CardLecture) => buyerFlags(lecture, buyer)

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
      <div className="toolbar">
        <form className={styles.search} role="search" onSubmit={search}>
          <input
            className="input"
            type="search"
            value={draft}
            maxLength={LECTURE_KEYWORD_MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="강의 제목, 강 제목, 판매자로 찾기"
            aria-label="강의 검색"
          />
          <button type="submit" className="btn">
            검색
          </button>
        </form>
        <div className={styles.sort}>
          {keyword && sort === 'RATING' && (
            <span className="fine">리뷰 수를 함께 반영한 순서예요</span>
          )}
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
          onShowAll={() => update({ keyword: '' })}
          guest={guest}
          flagsOf={flagsOf}
        />
      ) : (
        <LectureList
          sort={sort}
          page={page}
          setPage={setPage}
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
  guest,
  flagsOf,
}: {
  sort: LectureBrowseSort
  page: number
  setPage: ReturnType<typeof usePageParam>[1]
  guest: boolean
  flagsOf: (lecture: CardLecture) => ReactNode
}) {
  const query = useQuery(lecturesQuery({ sort: listSortOf(sort), page }))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  if (isPending || moving) return <Loading />
  if (error) return <LoadError error={error} retry={refetch} />
  if (data.content.length === 0) {
    return <EmptyState title="아직 판매 중인 강의가 없어요" />
  }
  return (
    <>
      <h2 className={styles.head}>전체 강의</h2>
      <div className={styles.grid}>
        {data.content.map((lecture) => (
          <LectureCard
            key={lecture.lectureId}
            lecture={lecture}
            guest={guest}
            flags={flagsOf(lecture)}
          />
        ))}
      </div>
      <Pager
        page={data.page.number}
        totalPages={data.page.totalPages}
        onChange={setPage}
      />
    </>
  )
}

type CardLecture = { lectureId: number; sellerUserId: number }

/** 보유 중·장바구니·내 강의 표시. 해당하는 것이 없으면 null이다 */
function buyerFlags(lecture: CardLecture, buyer: BuyerState) {
  const owned = buyer.owned.has(lecture.lectureId)
  const inCart = buyer.inCart.has(lecture.lectureId)
  const mine = lecture.sellerUserId === buyer.myUserId
  if (!owned && !inCart && !mine) return null
  return (
    <>
      {owned && <span className="pill ok">보유 중</span>}
      {inCart && <span className="pill info">장바구니</span>}
      {mine && <span className="pill mute">내 강의</span>}
    </>
  )
}
