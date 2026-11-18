import { useSyncExternalStore } from 'react'

/** 하단 탭바를 쓰는 폭. AppShell.module.css·SiteNav.module.css의 860px 분기와 같다(바꿀 때 함께 바꾼다). */
export const NARROW_QUERY = '(max-width: 860px)'

function subscribe(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {}
  const list = matchMedia(NARROW_QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function snapshot() {
  return typeof matchMedia === 'function' && matchMedia(NARROW_QUERY).matches
}

/**
 * 좁은 화면인지. 하단 탭바는 CSS로 숨기지 않고 이 값으로 그릴지 정한다. 넓은 화면에서 상단 메뉴와 같은 이름의 링크가
 * 접근성 트리에 두 벌 생기지 않게 하려는 것이다(matchMedia가 없는 환경은 넓은 화면으로 본다).
 */
export function useNarrow() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
