import type { CSSProperties, ReactNode } from 'react'
import styles from './LectureGrid.module.css'

/** 강의 카드 그리드. stale이면 새 결과를 받는 동안 이전 결과를 흐리게 둔다 */
export function LectureGrid({
  children,
  stale = false,
}: {
  children: ReactNode
  stale?: boolean
}) {
  return (
    <div
      className={`${styles.grid} ${stale ? styles.stale : ''}`}
      aria-busy={stale}
    >
      {children}
    </div>
  )
}

/**
 * 강의 카드 자리 모양 뼈대. 화면 낭독기에는 기존 불러오는 중과 같은 status 문구만 읽힌다.
 * 개수는 넓은 화면의 두 줄(4열 × 2)에 맞춘다.
 */
export function LectureGridSkeleton({
  label = '불러오는 중…',
  count = 8,
}: {
  label?: string
  count?: number
}) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={styles.skeleton}
            style={{ '--i': i } as CSSProperties}
          >
            <div className={`${styles.bone} ${styles.thumb}`} />
            <div className={styles.lines}>
              <div className={`${styles.bone} ${styles.line} ${styles.w90}`} />
              <div className={`${styles.bone} ${styles.line} ${styles.w60}`} />
              <div className={`${styles.bone} ${styles.line} ${styles.w40}`} />
              <div className={styles.foot}>
                <div
                  className={`${styles.bone} ${styles.line} ${styles.w40}`}
                />
                <div className={`${styles.bone} ${styles.line}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
