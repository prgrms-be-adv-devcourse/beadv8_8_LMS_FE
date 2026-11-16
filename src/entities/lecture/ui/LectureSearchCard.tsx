import { Fragment, type ReactNode } from 'react'
import { formatNumber } from '@/shared/lib/money'
import type { LectureSearchItem } from '../types'
import { LectureCardFrame } from './LectureCard'
import { Highlight } from './Highlight'
import { LectureThumb } from './LectureThumb'
import { Rating } from './Rating'
import cardStyles from './LectureCard.module.css'
import styles from './LectureSearchCard.module.css'

type LectureSearchCardProps = {
  item: LectureSearchItem
  /** 일괄 조회한 썸네일. undefined는 아직 받는 중이다 */
  thumbnailUrl: string | null | undefined
  onThumbnailError: () => void
  guest: boolean
  flags?: ReactNode
}

/**
 * 강의 검색 결과 카드. 강의 목록 카드와 같은 자리에 제목·판매자는 강조한 값(없으면 원문)을 넣고,
 * 소개 조각과 걸린 콘텐츠 제목은 있을 때만 덧붙여 왜 나왔는지 보인다.
 */
export function LectureSearchCard({
  item,
  thumbnailUrl,
  onThumbnailError,
  guest,
  flags,
}: LectureSearchCardProps) {
  const hl = item.highlights
  return (
    <LectureCardFrame lectureId={item.lectureId} guest={guest}>
      <LectureThumb
        lectureId={item.lectureId}
        title={item.title}
        thumbnailUrl={thumbnailUrl}
        onError={onThumbnailError}
      />
      <div className={cardStyles.meta}>
        <span className={cardStyles.title}>
          {hl?.title ? <Highlight html={hl.title} /> : item.title}
        </span>
        {(hl?.sellerNickname || item.sellerNickname) && (
          <span className={cardStyles.seller}>
            {hl?.sellerNickname ? (
              <Highlight html={hl.sellerNickname} />
            ) : (
              item.sellerNickname
            )}
          </span>
        )}
        <div className={cardStyles.foot}>
          <Rating average={item.averageRating} count={item.reviewCount} />
          {item.priceHp !== null && (
            <span className="num">{formatNumber(item.priceHp)} HP</span>
          )}
        </div>
        {hl?.description && (
          <p className={styles.snippet}>
            <Highlight html={hl.description} />
          </p>
        )}
        {hl && hl.contentTitles.length > 0 && (
          <p className={styles.snippet}>
            강의 내용:{' '}
            {hl.contentTitles.map((title, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                <Highlight html={title} />
              </Fragment>
            ))}
          </p>
        )}
        {flags && <div className={cardStyles.flags}>{flags}</div>}
      </div>
    </LectureCardFrame>
  )
}
