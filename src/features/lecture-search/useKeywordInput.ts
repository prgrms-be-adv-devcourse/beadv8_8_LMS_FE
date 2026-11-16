import { useEffect, useEffectEvent, useState } from 'react'
import { normalizeKeyword } from '@/entities/lecture/search'

/** 입력을 멈추고 이만큼 지나면 검색한다(글자마다 부르지 않는다) */
export const KEYWORD_DEBOUNCE_MS = 300

/**
 * 강의 검색창 입력값. 입력을 멈추면 debounce 뒤에, 엔터면 바로 commit으로 URL의 검색어를 바꾼다.
 * URL의 검색어가 바뀌면(뒤로·앞으로 가기, 링크 이동) 입력값을 그 값으로 맞춘다. 다만 입력값을 정리한 값이 이미 URL과 같으면
 * (방금 commit한 값) 그대로 둬 입력 중인 공백을 지우지 않는다.
 */
export function useKeywordInput(
  keyword: string,
  commit: (next: string) => void,
) {
  const [draft, setDraft] = useState(keyword)
  const [synced, setSynced] = useState(keyword)
  if (synced !== keyword) {
    setSynced(keyword)
    if (normalizeKeyword(draft) !== keyword) setDraft(keyword)
  }

  const onCommit = useEffectEvent(commit)
  const next = normalizeKeyword(draft)
  useEffect(() => {
    if (next === keyword) return
    const timer = setTimeout(() => onCommit(next), KEYWORD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [next, keyword])

  const submit = () => {
    if (next !== keyword) commit(next)
  }
  return { draft, setDraft, submit }
}
