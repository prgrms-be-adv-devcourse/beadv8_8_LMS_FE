import { useLayoutEffect, useRef } from 'react'

/**
 * 섹션이 화면에 처음 들어올 때 한 번만 나타나게 한다(`data-reveal` pending → in).
 * IntersectionObserver가 없거나(jsdom 테스트) 움직임 줄이기면 속성을 달지 않아 처음부터 보인다.
 * 칠하기 전에 숨겨야 깜빡이지 않으므로 layout effect에서 단다.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.dataset.reveal = 'pending'
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        el.dataset.reveal = 'in'
        observer.disconnect()
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      // 다시 붙을 때(개발 모드 이중 실행) 숨은 채로 남지 않게 지운다
      delete el.dataset.reveal
    }
  }, [])
  return ref
}
