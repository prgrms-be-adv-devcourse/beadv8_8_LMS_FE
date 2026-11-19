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
          <Price hp={lecture.priceHp} />
        </div>
        {flags && <div className={styles.flags}>{flags}</div>}
      </div>
    </>
  )

  return (
    <LectureCardFrame lectureId={lecture.lectureId} guest={guest}>
      {body}
    </LectureCardFrame>
  )
}

/** 카드의 가격. 숫자는 계기판처럼 모노로 크게, 단위는 작게 둔다 */
export function Price({ hp }: { hp: number }) {
  return (
    <span className={styles.price}>
      {formatNumber(hp)} <span className={styles.unit}>HP</span>
    </span>
  )
}

/** 강의 카드를 누르면 상세로 간다. 비회원은 상세를 볼 수 없어 로그인 모달을 열고, 로그인하면 그 상세로 보낸다 */
export function LectureCardFrame({
  lectureId,
  guest,
  children,
}: {
  lectureId: number
  guest: boolean
  children: ReactNode
}) {
  if (guest) {
    return (
      <button
        type="button"
        className={styles.card}
        onClick={() =>
          openLoginModal(
            '강의 상세와 구매는 로그인 후 이용할 수 있어요.',
            `/lectures/${lectureId}`,
          )
        }
      >
        {children}
      </button>
    )
  }
  return (
    <Link className={styles.card} to={`/lectures/${lectureId}`}>
      {children}
    </Link>
  )
}
