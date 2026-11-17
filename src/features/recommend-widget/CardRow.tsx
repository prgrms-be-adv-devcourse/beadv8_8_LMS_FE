import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import styles from './CardRow.module.css'

/**
 * 추천 카드를 한 줄로 놓는다. 공간이 있으면 카드가 너비를 나눠 채우고(최소 220px), 모자라면 옆으로 스크롤한다.
 * 스크롤바는 숨기고, 넘친 쪽 가장자리를 흐리게 하고 둥근 ‹ › 버튼을 둔다. 터치·트랙패드는 그대로 밀어 넘기고,
 * 키보드로 카드에 포커스를 옮기면 브라우저가 그 카드까지 스크롤한다. children은 li 목록이고(style --i: 순서),
 * 카드는 하나씩 차례로 나타난다.
 */
export function CardRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const list = useRef<HTMLUListElement>(null)
  const { before, after } = useOverflow(list)

  const move = (direction: 1 | -1) => {
    const el = list.current
    if (!el) return
    const reduce =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }

  return (
    <div
      className={styles.row}
      data-before={before || undefined}
      data-after={after || undefined}
    >
      <ul ref={list} className={styles.list} aria-label={label}>
        {children}
      </ul>
      {before && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.prev}`}
          aria-label={`${label} 앞으로`}
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}
      {after && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.next}`}
          aria-label={`${label} 더 보기`}
          onClick={() => move(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}

/** 가로로 넘쳐 앞(before)·뒤(after)에 더 볼 카드가 있는지. 크기가 바뀌거나 스크롤할 때 다시 잰다 */
function useOverflow(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ before: false, after: false })
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const before = el.scrollLeft > 1
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((prev) =>
      prev.before === before && prev.after === after ? prev : { before, after },
    )
  }, [ref])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [ref, measure])

  return edges
}
