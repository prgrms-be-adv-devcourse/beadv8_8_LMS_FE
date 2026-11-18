import { Link } from 'react-router'
import type { LectureRecommendItem } from '@/entities/chatbot/types'
import styles from './cards.module.css'
import { closeOnNarrowScreen } from './store'

/** 추천 강의 카드: 재생 표식, 제목과 이유 문장. 누르면 창을 연 채로(좁은 화면은 닫고) 강의 상세로 간다 */
export function LectureReasonCard({ item }: { item: LectureRecommendItem }) {
  return (
    <Link
      to={`/lectures/${item.lectureId}`}
      className={`${styles.card} ${styles.lecture}`}
      onClick={closeOnNarrowScreen}
    >
      {/* 추천 응답에는 썸네일이 없어 강의임을 알리는 재생 표식을 둔다 */}
      <span className={styles.thumb} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
        </svg>
      </span>
      <span className={styles.body}>
        <b className={styles.title}>{item.title}</b>
        <span className={styles.reason}>{item.reasonText}</span>
      </span>
      <span className={styles.go} aria-hidden="true">
        ›
      </span>
    </Link>
  )
}
