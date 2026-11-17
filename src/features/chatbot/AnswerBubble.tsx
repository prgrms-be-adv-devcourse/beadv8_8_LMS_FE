import { isTemporaryPopular } from '@/entities/chatbot/labels'
import type { RecommendBasis } from '@/entities/chatbot/types'
import styles from './AnswerBubble.module.css'
import bubbles from './bubbles.module.css'
import { MAIN_MENU, type AnswerItem, type MenuOption } from './conversation'
import { QuickReplies } from './QuickReplies'
import { RecommendationCards } from './RecommendationCards'
import { TypingDots } from './TypingDots'

/**
 * 챗봇의 답. 글은 받는 대로 이어 붙이고(받는 중에는 커서가 깜빡인다), 그 아래에 카드·참고한 FAQ·오류 안내.
 * 카드는 cards 이벤트로만 그린다(글에 강의 이름이 나와도 링크로 바꾸지 않는다).
 * 글을 받기 전에는 점 세 개를 보인다. 끝나면 가장 마지막 말풍선일 때 메뉴를 붙인다.
 */
export function AnswerBubble({
  item,
  active,
  onChoose,
}: {
  item: AnswerItem
  active: boolean
  onChoose: (option: MenuOption) => void
}) {
  const streaming = item.status === 'streaming'
  if (streaming && item.text === '')
    return <TypingDots label="답을 준비하는 중이에요" />

  const { lectures, influencers } = item.cards
  const hasCards = !!lectures?.items.length || !!influencers?.items.length
  return (
    <div
      className={`${bubbles.bot} ${hasCards ? bubbles.wide : ''}`}
      aria-busy={streaming}
    >
      {item.text !== '' && (
        <p className={bubbles.bubble}>
          {item.text}
          {streaming && <span className={styles.caret} aria-hidden="true" />}
        </p>
      )}
      {!!lectures?.items.length && (
        <>
          <TemporaryNote basis={lectures.basis} />
          <RecommendationCards target="LECTURE" items={lectures.items} />
        </>
      )}
      {!!influencers?.items.length && (
        <>
          <TemporaryNote basis={influencers.basis} />
          <RecommendationCards target="INFLUENCER" items={influencers.items} />
        </>
      )}
      {item.sources.length > 0 && (
        <div className={styles.sources}>
          <span className={styles.sourcesTitle}>참고한 FAQ</span>
          <ul>
            {item.sources.map((source) => (
              <li key={source.code}>{source.question}</li>
            ))}
          </ul>
        </div>
      )}
      {item.errorMessage && (
        <p className={styles.error} role="alert">
          {item.errorMessage}
        </p>
      )}
      {!streaming && (
        <QuickReplies options={MAIN_MENU} active={active} onChoose={onChoose} />
      )}
    </div>
  )
}

/**
 * 검색이 잠시 실패해 인기순으로 대신 고른 카드면 안내한다. 같은 질문을 다시 보내야 하므로 다시 시도 버튼은 두지 않는다.
 */
function TemporaryNote({ basis }: { basis: RecommendBasis }) {
  if (!isTemporaryPopular(basis)) return null
  return (
    <p className={styles.note}>
      지금은 맞춤 추천을 준비하지 못해 인기순으로 보여 드려요.
    </p>
  )
}
