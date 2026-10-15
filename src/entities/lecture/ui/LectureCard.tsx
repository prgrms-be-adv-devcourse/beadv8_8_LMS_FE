import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatNumber } from '@/shared/lib/money'
import { openLoginModal } from '@/shared/ui/loginModal'
import type { LectureSummary } from '../types'
import { LectureThumb } from './LectureThumb'
import { Rating } from './Rating'
import styles from './LectureCard.module.css'

type LectureCardProps = {
  lecture: LectureSummary
  /** 비회원은 상세를 볼 수 없어 누르면 로그인 모달을 연다 */
  guest: boolean
  /** 카드 아래 표시(보유 중·장바구니 등) */
  flags?: ReactNode
}

/** 강의 목록·홈의 강의 카드: 썸네일, 제목, 판매자, 평점, 가격 */
export function LectureCard({ lecture, guest, flags }: LectureCardProps) {
  const body = (
    <>
      <LectureThumb
        lectureId={lecture.lectureId}
        title={lecture.title}
        thumbnailUrl={lecture.thumbnailUrl}
      />
      <div className={styles.meta}>
        <span className={styles.title}>{lecture.title}</span>
        <span className={styles.seller}>{lecture.sellerNickname}</span>
        <div className={styles.foot}>
          <Rating average={lecture.averageRating} count={lecture.reviewCount} />
          <span className="num">{formatNumber(lecture.priceHp)} HP</span>
        </div>
        {flags && <div className={styles.flags}>{flags}</div>}
      </div>
    </>
  )

  if (guest) {
    return (
      <button
        type="button"
        className={styles.card}
        onClick={() =>
          openLoginModal('강의 상세와 구매는 로그인 후 이용할 수 있어요.')
        }
      >
        {body}
      </button>
    )
  }
  return (
    <Link className={styles.card} to={`/lectures/${lecture.lectureId}`}>
      {body}
    </Link>
  )
}
