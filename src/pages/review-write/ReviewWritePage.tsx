import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { reviewsQuery } from '@/entities/lecture/api'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { purchasedQuery } from '@/entities/order/api'
import { ReviewForm } from '@/features/review/ReviewForm'
import { meQuery } from '@/shared/auth/me'
import { formatDate } from '@/shared/lib/date'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function ReviewWritePage() {
  const lectureId = Number(useParams().lectureId)
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery)
  const purchased = useQuery(purchasedQuery)
  const reviews = useQuery(reviewsQuery(lectureId))
  const owned = purchased.data?.content.find((p) => p.lectureId === lectureId)
  const myReview = reviews.data?.content.find(
    (r) => r.reviewerUserId === me?.id,
  )

  const back = (
    <Link className="back" to="/library">
      ← 내 강의
    </Link>
  )
  const body = () => {
    if (purchased.isPending || reviews.isPending) return <Loading />
    const error = purchased.error ?? reviews.error
    if (error) return <LoadError error={error} />
    if (!owned || owned.itemStatus === 'PURCHASED')
      return (
        <EmptyState
          title="구매 확정한 강의에만 리뷰를 쓸 수 있어요"
          action={
            <Link className="btn primary" to="/library">
              내 강의로
            </Link>
          }
        >
          내 강의에서 구매를 확정하거나 재생하면 리뷰를 쓸 수 있어요.
        </EmptyState>
      )
    return (
      <>
        <section className="panel">
          <div className="row-item" style={{ padding: 0, flexWrap: 'nowrap' }}>
            <LectureThumb
              lectureId={owned.lectureId}
              title={owned.title}
              thumbnailUrl={owned.thumbnailUrl}
              size="sm"
            />
            <div className="row-main" style={{ minWidth: 0 }}>
              <span className="row-title">{owned.title}</span>
              <span className="fine">
                {formatDate(owned.purchasedAt)} 구매 · 구매 확정
              </span>
            </div>
          </div>
        </section>
        <ReviewForm
          lectureId={lectureId}
          orderItemId={owned.orderItemId}
          review={myReview}
          onDone={() => navigate('/library')}
          onCancel={() => navigate('/library')}
        />
      </>
    )
  }

  return (
    <div className="page narrow">
      {back}
      <PageHead
        title={myReview ? '리뷰 고치기' : '리뷰 쓰기'}
        lede="다른 구매자가 강의를 고를 때 참고해요. 구매 확정한 강의에만 쓸 수 있어요."
      />
      {body()}
    </div>
  )
}
