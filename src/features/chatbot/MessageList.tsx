import styles from './bubbles.module.css'
import { isLatest, type ChatItem } from './conversation'
import { QuickReplies } from './QuickReplies'
import { RecommendationBubble } from './RecommendationBubble'
import { useMenu } from './useMenu'

/** 대화의 말풍선을 종류별로 그린다 */
export function MessageList({ items }: { items: readonly ChatItem[] }) {
  const onChoose = useMenu()
  return (
    <div className={styles.list} role="log" aria-live="polite">
      {items.map((item) => {
        switch (item.kind) {
          case 'guide':
            return (
              <div key={item.id} className={styles.bot}>
                <p className={styles.bubble}>{item.text}</p>
                <QuickReplies
                  options={item.options}
                  active={isLatest(items, item.id)}
                  onChoose={onChoose}
                />
              </div>
            )
          case 'choice':
            return (
              <div key={item.id} className={styles.me}>
                <p className={styles.bubble}>{item.text}</p>
              </div>
            )
          case 'recommendation':
            return (
              <RecommendationBubble
                key={item.id}
                item={item}
                active={isLatest(items, item.id)}
                onChoose={onChoose}
              />
            )
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
