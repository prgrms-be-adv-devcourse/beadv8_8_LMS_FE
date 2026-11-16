import { useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent, type ReactNode } from 'react'
import { lectureSearchQuery } from '@/entities/lecture/api'
import { LECTURE_SEARCH_WINDOW } from '@/entities/lecture/search'
import type {
  LectureBrowseSort,
  LectureSearchItem,
} from '@/entities/lecture/types'
import { LectureSearchCard } from '@/entities/lecture/ui/LectureSearchCard'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, type usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { useLectureThumbnails } from './useLectureThumbnails'
import styles from './LectureSearchResults.module.css'

/** 429에 Retry-After가 없을 때 기다리는 초 */
const DEFAULT_RETRY_AFTER = 10

type LectureSearchResultsProps = {
  keyword: string
  sort: LectureBrowseSort
  page: number
  setPage: ReturnType<typeof usePageParam>[1]
  /** 검색어를 지우고 기본 목록(강의 목록 API)으로 돌아간다 */
  onShowAll: () => void
  guest: boolean
  /** 카드 아래 표시(보유 중·장바구니 등) */
  flagsOf?: (item: LectureSearchItem) => ReactNode
}

/**
 * 검색어가 있을 때의 강의 화면: 검색 API 결과와 썸네일 일괄 조회.
 * 새 결과를 받는 동안 이전 결과를 흐리게 두고, 늦게 온 이전 요청의 응답은 쿼리 키가 달라 쓰지 않는다.
 */
export function LectureSearchResults({
  keyword,
  sort,
  page,
  setPage,
  onShowAll,
  guest,
  flagsOf,
}: LectureSearchResultsProps) {
  const query = useQuery(lectureSearchQuery({ keyword, sort, page }))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, isPlaceholderData, refetch } = query
  const thumbnails = useLectureThumbnails(
    data?.content.map((item) => item.lectureId) ?? [],
  )
  const retryAfter = useRetryAfter(error, () => void refetch())

  const showAll = (
    <button type="button" className="btn" onClick={onShowAll}>
      전체 강의 보기
    </button>
  )

  if (isPending || moving) return <Loading label="검색하는 중…" />
  if (error) {
    if (isApiError(error, 'PAGE_TOO_DEEP')) {
      return (
        <EmptyState
          title="검색 결과는 앞에서 1,000건까지만 볼 수 있어요."
          action={
            <button type="button" className="btn" onClick={() => setPage(0)}>
              첫 페이지로
            </button>
          }
        >
          검색어를 좁혀 주세요.
        </EmptyState>
      )
    }
    if (retryAfter !== null) {
      return (
        <EmptyState title="요청이 너무 많아요. 잠시 후 다시 시도해 주세요.">
          {retryAfter}초 뒤에 다시 검색해요.
        </EmptyState>
      )
    }
    if (isApiError(error, 'SEARCH_UNAVAILABLE')) {
      return (
        <EmptyState
          title="지금은 검색할 수 없어요. 잠시 후 다시 시도해 주세요."
          action={
            <div className={styles.actions}>
              {showAll}
              <button type="button" className="btn" onClick={() => refetch()}>
                다시 시도
              </button>
            </div>
          }
        >
          검색이 멈춰도 전체 강의는 볼 수 있어요.
        </EmptyState>
      )
    }
    return <LoadError error={error} retry={refetch} />
  }
  if (data.content.length === 0) {
    return (
      <EmptyState title="검색 결과가 없어요." action={showAll}>
        다른 검색어로 찾아보세요.
      </EmptyState>
    )
  }

  const total = data.page.totalElements
  return (
    <>
      <h2 className={styles.head}>
        ‘{keyword}’ 검색 결과{' '}
        <span className="num muted">
          {total >= LECTURE_SEARCH_WINDOW
            ? `${formatNumber(LECTURE_SEARCH_WINDOW)}개 이상`
            : `${formatNumber(total)}개`}
        </span>
      </h2>
      <div
        className={`${styles.grid} ${isPlaceholderData ? styles.stale : ''}`}
        aria-busy={isPlaceholderData}
      >
        {data.content.map((item) => (
          <LectureSearchCard
            key={item.lectureId}
            item={item}
            thumbnailUrl={thumbnails.urlOf(item.lectureId)}
            onThumbnailError={() => thumbnails.onError(item.lectureId)}
            guest={guest}
            flags={flagsOf?.(item)}
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

/**
 * 호출 제한(429)이면 Retry-After초 뒤에 다시 부른다. 기다리는 초를 돌려주고, 429가 아니면 null이다.
 * 실패할 때마다 오류가 새로 생기므로 다시 429여도 그 응답의 Retry-After만큼 다시 기다린다.
 */
function useRetryAfter(error: Error | null, retry: () => void) {
  const seconds = isApiError(error, 'TOO_MANY_REQUESTS')
    ? (error.retryAfter ?? DEFAULT_RETRY_AFTER)
    : null
  const onRetry = useEffectEvent(retry)
  useEffect(() => {
    if (seconds === null) return
    const timer = setTimeout(() => onRetry(), seconds * 1000)
    return () => clearTimeout(timer)
  }, [error, seconds])
  return seconds
}
