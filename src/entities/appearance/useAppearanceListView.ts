import { useSearchParams } from 'react-router'
import { appearanceListViewOf, type AppearanceListView } from './api'

/**
 * 성립한 출연 목록의 보기(주소 `?aview=ended`). 없거나 모르는 값이면 기본(진행 중)이다.
 * 보기를 바꾸면 성립한 출연 목록만 첫 페이지부터 본다(요청 목록 페이지는 그대로)
 */
export function useAppearanceListView() {
  const [params, setParams] = useSearchParams()
  const view = appearanceListViewOf(params.get('aview'))
  const select = (next: AppearanceListView) =>
    setParams((prev) => {
      const search = new URLSearchParams(prev)
      if (next === 'ended') search.set('aview', 'ended')
      else search.delete('aview')
      search.delete('apage')
      return search
    })
  return [view, select] as const
}
