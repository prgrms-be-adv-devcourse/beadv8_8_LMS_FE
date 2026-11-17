import { useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router'

/**
 * 앱 상단 헤더(AppShell의 첫 header, sticky)의 아래 끝 위치(px). 데스크톱 채팅창을 헤더 바로 아래부터 그리는 데 쓴다.
 * 헤더 높이는 화면 폭·레이아웃마다 다르고, 홈과 다른 화면은 서로 다른 header 요소를 그리므로
 * 화면을 옮길 때마다 다시 찾아 잰다. 헤더가 없거나 잴 수 없으면 0.
 */
export function useHeaderBottom(): number {
  const { pathname } = useLocation()
  const [bottom, setBottom] = useState(0)
  useLayoutEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const measure = () =>
      setBottom(Math.max(0, header.getBoundingClientRect().bottom))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [pathname])
  return bottom
}
