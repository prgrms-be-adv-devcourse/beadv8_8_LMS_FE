import { useState } from 'react'

/**
 * 검색창 입력값. 처음에는 URL의 검색어로 시작하고, URL의 검색어가 바뀌면(뒤로·앞으로 가기, 링크 이동) 그 값으로 맞춘다.
 * URL이 그대로인 동안에는 입력 중인 값을 덮어쓰지 않는다. effect 대신 렌더 중에 이전 검색어와 비교해 맞춘다
 * (React 문서의 'prop이 바뀔 때 state 조정' 방식이라 한 번 더 그리지 않는다)
 */
export function useSearchDraft(keyword: string) {
  const [draft, setDraft] = useState(keyword)
  const [synced, setSynced] = useState(keyword)
  if (synced !== keyword) {
    setSynced(keyword)
    setDraft(keyword)
  }
  return [draft, setDraft] as const
}
