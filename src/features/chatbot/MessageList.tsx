import styles from './bubbles.module.css'
import type { ChatItem } from './conversation'

/** 대화의 말풍선을 종류별로 그린다 */
export function MessageList({ items }: { items: readonly ChatItem[] }) {
  return (
    <div className={styles.list} role="log" aria-live="polite">
      {items.map((item) => {
        switch (item.kind) {
          case 'notice':
            return (
              <p key={item.id} className={styles.notice}>
                {item.text}
              </p>
            )
        }
      })}
    </div>
  )
}
