import { useSearchParams } from 'react-router'
import { holdListViewOf, type HoldListView } from './api'

/**
 * 내가 보낸 요청서·올린 모집글 목록의 보기(주소 `?view=failed`). 없거나 모르는 값이면 기본('등록된 글')이다.
 * 보기를 바꾸면 첫 페이지부터 본다
 */
export function useHoldListView() {
  const [params, setParams] = useSearchParams()
  const view = holdListViewOf(params.get('view'))
  const select = (next: HoldListView) =>
    setParams((prev) => {
      const search = new URLSearchParams(prev)
      if (next === 'failed') search.set('view', 'failed')
      else search.delete('view')
      search.delete('page')
      return search
    })
  return [view, select] as const
}
