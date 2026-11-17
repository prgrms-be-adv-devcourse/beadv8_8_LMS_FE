import type { CSSProperties } from 'react'
import type {
  InfluencerRecommendItem,
  LectureRecommendItem,
} from '@/entities/chatbot/types'
import styles from './cards.module.css'
import { InfluencerReasonCard } from './InfluencerReasonCard'
import { LectureReasonCard } from './LectureReasonCard'

type Props =
  | { target: 'LECTURE'; items: readonly LectureRecommendItem[] }
  | { target: 'INFLUENCER'; items: readonly InfluencerRecommendItem[] }

/** 이유 붙은 추천 카드 목록(추천받기 버튼·자유 질문 답이 함께 쓴다). 순서대로 세로로 쌓는다 */
export function RecommendationCards(props: Props) {
  const label = props.target === 'LECTURE' ? '추천 강의' : '추천 인플루언서'
  return (
    <ul className={styles.cards} aria-label={label}>
      {props.target === 'LECTURE'
        ? props.items.map((item, i) => (
            <li key={item.lectureId} style={{ '--i': i } as CSSProperties}>
              <LectureReasonCard item={item} />
            </li>
          ))
        : props.items.map((item, i) => (
            <li key={item.memberId} style={{ '--i': i } as CSSProperties}>
              <InfluencerReasonCard item={item} />
            </li>
          ))}
    </ul>
  )
}
