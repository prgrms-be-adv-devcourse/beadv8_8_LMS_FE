import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { PagedModel } from '@/shared/api/types'

/** URL의 1부터 세는 페이지 번호(key)를 0부터 세는 값으로 읽고 쓴다. 다른 검색어는 그대로 둔다. */
export function usePageParam(key: string) {
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
export function useClampPage(
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
