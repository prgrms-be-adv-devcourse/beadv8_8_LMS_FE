import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import styles from './bubbles.module.css'
import { MAIN_MENU } from './conversation'
import { QuickReplies } from './QuickReplies'
import replies from './QuickReplies.module.css'
import { closeOnNarrowScreen } from './store'
import { useMenu } from './useMenu'

/**
 * 대화 맨 위 인사와 메뉴. 대화가 아니라 history에 넣지 않는다. 메뉴는 대화가 비어 있을 때만 누를 수 있다.
 * 'FAQ 전체 보기 ↗'는 자주 묻는 질문 페이지로 가는 링크라 고른 것으로 남기지 않고 늘 누를 수 있다
 * (창은 연 채로 두고, 좁은 화면에서는 닫는다).
 */
export function Greeting({ active }: { active: boolean }) {
  const onChoose = useMenu()
  return (
    <div className={styles.bot}>
      <p className={styles.bubble}>
        안녕하세요, 합방 챗봇이에요. 무엇을 도와드릴까요?
      </p>
      <QuickReplies options={MAIN_MENU} active={active} onChoose={onChoose}>
        <Link
          to="/support/faq"
          className={`${replies.reply} ${replies.link}`}
          style={{ '--i': MAIN_MENU.length } as CSSProperties}
          onClick={closeOnNarrowScreen}
        >
          FAQ 전체 보기 ↗
        </Link>
      </QuickReplies>
    </div>
  )
}
