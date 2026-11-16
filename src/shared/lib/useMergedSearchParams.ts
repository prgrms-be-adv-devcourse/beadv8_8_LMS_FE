import { useEffect, useRef } from 'react'
import { useLocation, useNavigation, useSearchParams } from 'react-router'

type Merge = (current: URLSearchParams) => URLSearchParams

/**
 * URL 검색어를 연달아 바꾸는 화면의 setSearchParams.
 * setSearchParams가 합칠 때 쓰는 값은 아직 끝나지 않은 이동(loader 대기)을 반영하지 않아, 연달아 바꾸면 앞서 바꾼 값이 사라진다.
 * 그래서 마지막으로 보낸 값 위에 합치고, 이동이 끝나 멈추면(완료·취소·실패, 뒤로 가기 포함) 실제 URL 값으로 다시 맞춘다.
 */
export function useMergedSearchParams() {
  const [params, setParams] = useSearchParams()
  const { search, key } = useLocation()
  const { state } = useNavigation()
  const latest = useRef(search)
  useEffect(() => {
    if (state === 'idle') latest.current = search
  }, [state, search, key])

  const update = (merge: Merge, { replace = false } = {}) => {
    const next = merge(new URLSearchParams(latest.current))
    latest.current = `?${next.toString()}`
    setParams(next, { replace })
  }
  return [params, update] as const
}
