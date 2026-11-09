import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Rating, Stars } from '@/entities/lecture/ui/Rating'
import { formatDate } from '@/shared/lib/date'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { Avatar } from '@/shared/ui/Avatar'
import { Pager } from '@/shared/ui/Pager'
import { InlineLoadError } from '@/shared/ui/QueryState'
import { receivedAppearanceReviewsQuery } from '../api'
import { revieweeRoleLabel } from '../appearanceReview'
import type {
  AppearanceRating,
  RatingSummary,
  ReceivedAppearanceReview,
} from '../types'
import styles from './ReceivedAppearanceReviews.module.css'

type ReceivedAppearanceReviewsProps = {
  memberId: number
  rating: AppearanceRating
}

/**
 * 회원이 받은 출연 리뷰(공개된 것만, 최신 공개순). 페이지는 URL ?page=에 둔다.
 * 리뷰는 BE가 출연 앱에서 읽어 와 출연 앱 장애면 이 영역만 실패한다(503). 프로필·평점은 회원 앱 값이라 그대로 보인다.
 * 쓴 회원은 프로필로 잇지 않는다(탈퇴한 회원도 ID가 오고 닉네임만 '탈퇴한 회원'이라 FE가 가릴 수 없다).
 */
export function ReceivedAppearanceReviews({
  memberId,
  rating,
}: ReceivedAppearanceReviewsProps) {
  const titleId = useId()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(receivedAppearanceReviewsQuery(memberId, page))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, isFetching, refetch } = query

  return (
    <section className="panel" aria-labelledby={titleId}>
      <div className="panel-head">
        <h2 id={titleId}>받은 출연 리뷰</h2>
        {rating.total.count > 0 && (
          <div className={styles.byRole}>
            <RoleRating label="호스트로" rating={rating.asHost} />
            <RoleRating label="게스트로" rating={rating.asGuest} />
          </div>
        )}
      </div>
      {error ? (
        <InlineLoadError
          title="받은 출연 리뷰를 불러오지 못했어요."
          error={error}
          retry={() => void refetch()}
          retrying={isFetching}
        />
      ) : isPending || moving ? (
        <p className="fine">불러오는 중…</p>
      ) : data.content.length === 0 ? (
        <p className="fine">아직 받은 출연 리뷰가 없어요.</p>
      ) : (
        <>
          <div>
            {data.content.map((review) => (
              <ReviewItem key={review.reviewId} review={review} />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </section>
  )
}

/** 받은 역할별 평점: 호스트로 ★ 4.7 (7) */
function RoleRating({
  label,
  rating,
}: {
  label: string
  rating: RatingSummary
}) {
  return (
    <span role="group" aria-label={`${label} 받은 평점`}>
      <span className="fine">{label}</span> <Rating {...rating} />
    </span>
  )
}

function ReviewItem({ review }: { review: ReceivedAppearanceReview }) {
  const { reviewer } = review
  return (
    <article
      className={styles.item}
      aria-label={`${reviewer.nickname} 님의 리뷰`}
    >
      <div className={styles.head}>
        <Avatar
          name={reviewer.nickname}
          imageUrl={reviewer.profileImageUrl}
          size={28}
        />
        <b>{reviewer.nickname}</b>
        <Stars value={review.rating} />
        <span className="pill line">
          {revieweeRoleLabel(review.revieweeRole)}
        </span>
        <span className="fine">{formatDate(review.publishedAt)}</span>
      </div>
      {review.content && <p className={styles.content}>{review.content}</p>}
    </article>
  )
}
