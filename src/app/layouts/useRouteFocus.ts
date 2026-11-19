import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/**
 * 경로가 바뀌면 새 화면의 h1(없으면 본문 main)으로 포커스를 옮긴다. 키보드·낭독기 사용자가 이전 화면에서 누른 자리에
 * 남지 않고 새 화면 처음부터 읽게 한다. 첫 화면과 검색어만 바뀐 이동(정렬·필터·탭)은 그대로 둔다.
 * 경로로 여는 모달처럼 이미 대화상자 안에 포커스가 있으면 빼앗지 않는다.
 * 스크롤은 ScrollRestoration이 맡으므로 포커스로 스크롤하지 않는다(뒤로 가기에서 되살린 위치를 지킨다).
 */
export function useRouteFocus(mainId: string) {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    if (document.activeElement?.closest('[role="dialog"]')) return
    const main = document.getElementById(mainId)
    if (!main) return
    const heading = main.querySelector('h1')
    if (heading && !heading.hasAttribute('tabindex'))
      heading.setAttribute('tabindex', '-1')
    ;(heading ?? main).focus({ preventScroll: true })
  }, [pathname, mainId])
}
