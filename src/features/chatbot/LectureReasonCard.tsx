import { Link } from 'react-router'
import type { LectureRecommendItem } from '@/entities/chatbot/types'
import styles from './cards.module.css'
import { closeOnNarrowScreen } from './store'

/** 추천 강의 카드: 제목과 이유 문장. 누르면 창을 연 채로(좁은 화면은 닫고) 강의 상세로 간다 */
export function LectureReasonCard({ item }: { item: LectureRecommendItem }) {
  return (
    <Link
      to={`/lectures/${item.lectureId}`}
      className={styles.card}
      onClick={closeOnNarrowScreen}
    >
      <b className={styles.title}>{item.title}</b>
      <span className={styles.reason}>{item.reasonText}</span>
    </Link>
  )
}
