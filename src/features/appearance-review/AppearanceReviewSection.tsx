import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  appearanceKeys,
  writeAppearanceReview,
} from '@/entities/appearance/api'
import { REVIEW_CONTENT_MAX } from '@/entities/appearance/rules'
import type {
  Appearance,
  AppearanceReview,
  AppearanceReviewInput,
} from '@/entities/appearance/types'
import { Stars } from '@/entities/lecture/ui/Rating'
import { isApiError } from '@/shared/api/ApiError'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { toast } from '@/shared/ui/toastStore'
import styles from './AppearanceReviewSection.module.css'

const LABEL = ['', '아쉬워요', '그저 그래요', '괜찮아요', '좋아요', '최고예요']

/**
 * 화면이 오래돼 상세의 reviewable이 맞지 않을 때의 오류(이미 씀·확인 전·상대 이용 불가·기한 지남).
 * 안내한 뒤 상세를 다시 불러오면 쓰기 버튼이 사라진다
 */
const STALE_CODES = new Set([
  'ALREADY_REVIEWED',
  'APPEARANCE_NOT_REVIEWABLE',
  'REVIEWEE_NOT_ACTIVE',
  'REVIEW_PERIOD_ENDED',
])

/**
 * 출연 리뷰 쓰기(호스트·게스트). 공개 여부는 응답에 없으므로 성공하면 출연 상세를 다시 불러온다.
 * 409(화면이 오래됨)도 안내한 뒤 상세를 다시 불러온다. 그 밖의 오류는 서버 문구로 알린다
 */
function useWriteAppearanceReview(appearanceId: number) {
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: appearanceKeys.appearance(appearanceId),
    })
  return useMutation({
    mutationFn: (input: AppearanceReviewInput) =>
      writeAppearanceReview(appearanceId, input),
    onSuccess: async () => {
      toast('리뷰를 남겼어요.')
      await refresh()
    },
    onError: (error) => {
      toast(error.message)
      if (isApiError(error) && STALE_CODES.has(error.code)) void refresh()
    },
  })
}

/**
 * 출연 상세의 리뷰. 쓸 수 있는지는 상세의 reviewable만 본다(FE가 따로 계산하지 않는다).
 * - 쓸 수 있으면 '리뷰 쓰기' → 별점(1~5 정수)·본문(선택, 1,000자)
 * - 내가 쓴 리뷰: 공개 전이면 '상대가 리뷰를 쓰면 함께 공개돼요', 공개 뒤면 공개됨
 * - 받은 리뷰: 함께 공개된 뒤에만 온다(그 전에는 영역 없음, 오류 아님)
 * 쓸 수도 없고 쓴 리뷰도 없으면(확인 전·취소·불참 등) 아무것도 보이지 않는다. 수정·삭제는 없다
 */
export function AppearanceReviewSection({
  appearance,
}: {
  appearance: Appearance
}) {
  const { reviewable, myReview, receivedReview } = appearance
  const [writing, setWriting] = useState(false)
  if (!reviewable && !myReview && !receivedReview) return null
  return (
    <section className="panel" aria-labelledby="appearance-review-title">
      <div className="panel-head">
        <h2 id="appearance-review-title">리뷰</h2>
      </div>
      {reviewable &&
        !myReview &&
        (writing ? (
          <ReviewWriteForm
            appearanceId={appearance.id}
            onCancel={() => setWriting(false)}
          />
        ) : (
          <div className="toolbar">
            <p className="fine">
              함께한 상대에게 별점과 짧은 리뷰를 남겨 주세요. 두 사람이 모두
              쓰면 함께 공개되고, 쓴 뒤에는 고칠 수 없어요.
            </p>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => setWriting(true)}
            >
              리뷰 쓰기
            </button>
          </div>
        ))}
      {myReview && (
        <ReviewItem
          label="내가 쓴 리뷰"
          review={myReview}
          note={myReview.published ? null : '상대가 리뷰를 쓰면 함께 공개돼요.'}
        />
      )}
      {receivedReview && (
        <ReviewItem
          label="상대가 쓴 리뷰"
          review={receivedReview}
          note={null}
        />
      )}
    </section>
  )
}

function ReviewItem({
  label,
  review,
  note,
}: {
  label: string
  review: AppearanceReview
  note: string | null
}) {
  return (
    <article className={styles.item} aria-label={label}>
      <div className={styles.itemHead}>
        <b>{label}</b>
        <Stars value={review.rating} />
        {review.published ? (
          <span className="pill ok">공개됨</span>
        ) : (
          <span className="pill mute">공개 전</span>
        )}
        <span className="fine">{formatDateTime(review.createdAt)}</span>
      </div>
      {review.content && <p className={styles.content}>{review.content}</p>}
      {note && <p className="fine">{note}</p>}
    </article>
  )
}

function ReviewWriteForm({
  appearanceId,
  onCancel,
}: {
  appearanceId: number
  onCancel: () => void
}) {
  const write = useWriteAppearanceReview(appearanceId)
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const length = content.trim().length
  const tooLong = length > REVIEW_CONTENT_MAX

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (tooLong || write.isPending) return
    const trimmed = content.trim()
    // 별점은 정수만 보낸다(별을 고르는 UI라 늘 1~5 정수). 본문은 비어 있으면 보내지 않는다.
    write.mutate(trimmed ? { rating, content: trimmed } : { rating })
  }

  return (
    <form className="form" onSubmit={submit} aria-label="출연 리뷰 쓰기">
      <div className="field">
        <span className={styles.label} id="appearance-review-rating">
          별점
        </span>
        {/* 네이티브 라디오라 Tab 한 번으로 들어가 방향키로 고른다. 별 모양은 라벨로 그린다 */}
        <div
          className={styles.stars}
          role="radiogroup"
          aria-labelledby="appearance-review-rating"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={
                n <= rating ? `${styles.star} ${styles.on}` : styles.star
              }
            >
              <input
                type="radio"
                name="appearance-review-rating"
                className={styles.radio}
                value={n}
                checked={n === rating}
                onChange={() => setRating(n)}
                aria-label={`${n}점`}
              />
              ★
            </label>
          ))}
          <span className="fine" style={{ marginLeft: 8 }}>
            {LABEL[rating]}
          </span>
        </div>
      </div>
      <div className={tooLong ? 'field invalid' : 'field'}>
        <label htmlFor="appearance-review-content">리뷰</label>
        <textarea
          id="appearance-review-content"
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={tooLong || undefined}
          aria-describedby="appearance-review-count"
          placeholder="함께한 방송은 어땠는지 알려 주세요"
        />
        <span id="appearance-review-count" className="fine">
          {formatNumber(length)} / {formatNumber(REVIEW_CONTENT_MAX)}자 · 내용은
          선택 사항이에요.
          {tooLong && ' 1,000자까지 쓸 수 있어요.'}
        </span>
      </div>
      <div className={styles.actions}>
        <button type="button" className="btn ghost" onClick={onCancel}>
          취소
        </button>
        <button
          type="submit"
          className="btn primary"
          disabled={write.isPending || tooLong}
        >
          리뷰 남기기
        </button>
      </div>
      <p className="fine">리뷰는 남긴 뒤 고치거나 지울 수 없어요.</p>
    </form>
  )
}
