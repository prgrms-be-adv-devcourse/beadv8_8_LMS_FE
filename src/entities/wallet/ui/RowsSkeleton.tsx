import styles from './RowsSkeleton.module.css'

/**
 * 지갑 목록을 불러오는 중: 행 모양 뼈대. 화면 낭독기와 테스트는 기존 Loading처럼
 * role="status"와 '불러오는 중…'으로 읽는다.
 */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={styles.rows} role="status">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row} aria-hidden="true">
          <span className={`${styles.bar} ${styles.mid}`} />
          <span
            className={`${styles.bar} ${i % 2 ? styles.mid : styles.wide}`}
          />
          <span className={`${styles.bar} ${styles.amt}`} />
        </div>
      ))}
    </div>
  )
}
