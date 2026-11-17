import styles from './bubbles.module.css'
import { MAIN_MENU } from './conversation'
import { QuickReplies } from './QuickReplies'
import { useMenu } from './useMenu'

/** 대화 맨 위 인사와 메뉴. 대화가 아니라 history에 넣지 않는다. 메뉴는 대화가 비어 있을 때만 누를 수 있다 */
export function Greeting({ active }: { active: boolean }) {
  const onChoose = useMenu()
  return (
    <div className={styles.bot}>
      <p className={styles.bubble}>
        안녕하세요, 합방 챗봇이에요. 무엇을 도와드릴까요?
      </p>
      <QuickReplies options={MAIN_MENU} active={active} onChoose={onChoose} />
    </div>
  )
}
