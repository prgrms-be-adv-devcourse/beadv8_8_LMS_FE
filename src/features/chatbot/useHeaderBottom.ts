import { useLayoutEffect, useState } from 'react'

/**
 * 앱 상단 헤더(AppShell의 첫 header, sticky)의 아래 끝 위치(px). 데스크톱 채팅창을 헤더 바로 아래부터 그리는 데 쓴다.
 * 헤더 높이는 화면 폭·레이아웃(홈 헤더)마다 달라 재서 쓴다. 헤더가 없거나 잴 수 없으면 0.
 */
export function useHeaderBottom(): number {
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
  }, [])
  return bottom
}
