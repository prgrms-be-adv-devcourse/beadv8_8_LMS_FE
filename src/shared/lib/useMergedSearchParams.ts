import { useCallback, useEffect } from 'react'
import { useLocation, useNavigation, useSearchParams } from 'react-router'

type Merge = (current: URLSearchParams) => URLSearchParams

/**
 * 마지막으로 보낸 검색어와 그때의 주소(location.key).
 * 한 화면에서도 목록 조건과 페이지 번호를 다른 훅이 바꾸므로, 훅마다 두지 않고 함께 쓴다.
 * 주소가 바뀌었으면(이동 완료·다른 이동) 기준이 아니다.
 */
let sent: { key: string; search: string } | null = null

/**
 * URL 검색어를 연달아 바꾸는 화면의 setSearchParams.
 * setSearchParams가 합칠 때 쓰는 값은 아직 끝나지 않은 이동(loader 대기)을 반영하지 않아, 연달아 바꾸면 앞서 바꾼 값이 사라진다.
 * 그래서 마지막으로 보낸 값 위에 합치고, 이동이 끝나 멈추면(완료·취소·실패, 뒤로 가기 포함) 실제 URL 값으로 다시 맞춘다.
 * 보낸 값은 이 훅을 쓰는 모든 곳이 함께 본다(조건을 바꾼 직후 페이지를 넘겨도 조건이 남는다).
 */
export function useMergedSearchParams() {
  const [params, setParams] = useSearchParams()
  const { search, key } = useLocation()
  const { state } = useNavigation()
  useEffect(() => {
    if (state === 'idle') sent = null
  }, [state, search, key])

  const update = useCallback(
    (merge: Merge, { replace = false } = {}) => {
      const base = sent?.key === key ? sent.search : search
      const next = merge(new URLSearchParams(base))
      sent = { key, search: `?${next.toString()}` }
      setParams(next, { replace })
    },
    [key, search, setParams],
  )
  return [params, update] as const
}
