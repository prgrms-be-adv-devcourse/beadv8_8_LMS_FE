import bubbles from './bubbles.module.css'
import styles from './TypingDots.module.css'

/** 답을 기다리는 동안의 말풍선: 점 세 개가 차례로 튄다. 화면 낭독기에는 label을 읽어 준다 */
export function TypingDots({ label }: { label: string }) {
  return (
    <div className={bubbles.bot}>
      <p className={`${bubbles.bubble} ${styles.typing}`} role="status">
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.dot} aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </p>
    </div>
  )
}
