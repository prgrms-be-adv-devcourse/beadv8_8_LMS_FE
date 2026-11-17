import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { LectureRecommendItem } from '@/entities/chatbot/types'
import { CardRow } from './CardRow'
import styles from './LectureRecommendList.module.css'

/** 추천 강의 카드 한 줄: 제목과 이유 문장. 누르면 강의 상세로 간다 */
export function LectureRecommendList({
  items,
}: {
  items: readonly LectureRecommendItem[]
}) {
  return (
    <CardRow label="추천 강의">
      {items.map((item, i) => (
        <li key={item.lectureId} style={{ '--i': i } as CSSProperties}>
          <Link to={`/lectures/${item.lectureId}`} className={styles.card}>
            <b className={styles.title}>{item.title}</b>
            <span className={styles.reason}>{item.reasonText}</span>
          </Link>
        </li>
      ))}
    </CardRow>
  )
}
