import { isTemporaryPopular } from '@/entities/chatbot/labels'
import bubbles from './bubbles.module.css'
import styles from './cards.module.css'
import {
  MAIN_MENU,
  type MenuOption,
  type RecommendationItem,
} from './conversation'
import { InterestForm } from './InterestForm'
import { QuickReplies } from './QuickReplies'
import { RecommendationCards } from './RecommendationCards'
import { TypingDots } from './TypingDots'
import { useRecommend } from './useRecommend'

const WORD = { LECTURE: '강의', INFLUENCER: '인플루언서' } as const

/**
 * 추천받기 결과 말풍선. 기다리는 동안 점 세 개, 받으면 이유 붙은 카드와 그 아래 안내·메뉴.
 * - notice: 추천하지 못한 까닭을 카드 대신 그대로 보인다
 * - 관심사 입력: 늘 두고(관심사가 있어야 BE가 쿼리 확장으로 맞춤 후보를 찾는다), 받으면 같은 추천을 다시 부른다.
 *   needsInterest(맞춤 재료 없음)면 관심사를 알려 달라고 안내한다. 가장 마지막 말풍선에만 보인다(지난 말풍선은 숨긴다)
 * - basis가 POPULAR_TEMPORARY일 때만: 인기순 안내와 다시 시도(같은 관심사로)
 * 다시 시도·메뉴는 가장 마지막 말풍선일 때만 누를 수 있다.
 */
export function RecommendationBubble({
  item,
  active,
  onChoose,
}: {
  item: RecommendationItem
  active: boolean
  onChoose: (option: MenuOption) => void
}) {
  const recommend = useRecommend()
  const word = WORD[item.target]
  if (item.result === null)
    return <TypingDots label={`${word} 추천을 고르는 중이에요`} />

  const { result } = item
  const empty = result.items.length === 0
  return (
    <div className={`${bubbles.bot} ${bubbles.wide}`}>
      <p className={bubbles.bubble}>
        {empty
          ? (result.notice ?? `지금은 추천할 ${word}가 없어요.`)
          : `이런 ${word}는 어떠세요? 고른 이유도 함께 적었어요.`}
      </p>
      {!empty &&
        (item.target === 'LECTURE' ? (
          <RecommendationCards
            target="LECTURE"
            items={item.result?.items ?? []}
          />
        ) : (
          <RecommendationCards
            target="INFLUENCER"
            items={item.result?.items ?? []}
          />
        ))}
      {isTemporaryPopular(result.basis) && (
        <div className={styles.note}>
          <span>지금은 맞춤 추천을 준비하지 못해 인기순으로 보여 드려요.</span>
          <button
            type="button"
            className={`btn sm ${styles.retry}`}
            disabled={!active}
            onClick={() =>
              recommend(item.target, item.interest, `${word} 다시 추천받기`)
            }
          >
            다시 시도
          </button>
        </div>
      )}
      {active && (
        <div className={styles.note}>
          <span>
            {result.needsInterest
              ? '관심사를 알려 주면 더 맞게 찾아 드릴게요.'
              : '관심사를 적으면 그에 맞춰 다시 찾아 드려요.'}
          </span>
          <InterestForm
            active={active}
            onSubmit={(interest) =>
              recommend(item.target, interest, `관심사: ${interest}`)
            }
          />
        </div>
      )}
      <QuickReplies options={MAIN_MENU} active={active} onChoose={onChoose} />
    </div>
  )
}
