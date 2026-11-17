import type { CSSProperties, ReactNode } from 'react'
import { MENU_LABEL, type MenuOption } from './conversation'
import styles from './QuickReplies.module.css'

/**
 * 챗봇 말풍선 아래의 버튼(카톡 빠른 답장). 가장 최근 말풍선의 버튼만 누를 수 있고 지난 버튼은 흐리게 남긴다.
 * 버튼은 하나씩 차례로 나타난다. children은 버튼 줄 끝에 붙는 링크 등이다(버튼과 달리 고른 것으로 남지 않는다).
 */
export function QuickReplies({
  options,
  active,
  onChoose,
  children,
}: {
  options: readonly MenuOption[]
  active: boolean
  onChoose: (option: MenuOption) => void
  children?: ReactNode
}) {
  if (options.length === 0 && !children) return null
  return (
    <div className={styles.replies} role="group" aria-label="고를 수 있는 것">
      {options.map((option, i) => (
        <button
          key={option}
          type="button"
          className={styles.reply}
          style={{ '--i': i } as CSSProperties}
          disabled={!active}
          onClick={() => onChoose(option)}
        >
          {MENU_LABEL[option]}
        </button>
      ))}
      {children}
    </div>
  )
}
