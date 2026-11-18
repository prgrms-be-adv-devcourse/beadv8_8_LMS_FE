import styles from './CardSkeleton.module.css'

/**
 * 모집·출연 카드 목록 자리 모양(뼈대). 화면 낭독기에는 기존 불러오는 중 안내(status)만 읽힌다.
 * count는 보이는 줄 수다(목록 첫 화면 높이만큼만).
 */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={styles.list} role="status">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: count }, (_, k) => (
        <div key={k} className={styles.card} aria-hidden="true">
          <span className={`${styles.bone} ${styles.date}`} />
          <span className={styles.body}>
            <span className={`${styles.bone} ${styles.title}`} />
            <span className={`${styles.bone} ${styles.line}`} />
          </span>
          <span className={`${styles.bone} ${styles.fee}`} />
        </div>
      ))}
    </div>
  )
}
