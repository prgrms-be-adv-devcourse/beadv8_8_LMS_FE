import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  createReview,
  deleteReview,
  lectureKeys,
  updateReview,
  type ReviewInput,
} from '@/entities/lecture/api'
import type { Review } from '@/entities/lecture/types'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'
import styles from './ReviewForm.module.css'

const LABEL = ['', '아쉬워요', '그저 그래요', '괜찮아요', '좋아요', '최고예요']
type ReviewFormProps = {
  lectureId: number
  /** 새 리뷰를 쓸 구매 확정 항목 */
  orderItemId: number
  /** 이미 쓴 리뷰가 있으면 수정 */
  review?: Review
  onDone: () => void
  onCancel: () => void
}

export function ReviewForm({
  lectureId,
  orderItemId,
  review,
  onDone,
  onCancel,
}: ReviewFormProps) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(review?.rating ?? 5)
  const [content, setContent] = useState(review?.content ?? '')
  // 별 위에 포인터를 올리면 고르기 전에 몇 점인지 미리 보인다(누르기 전까지 값은 그대로)
  const [preview, setPreview] = useState<number | null>(null)
  // 지운 리뷰는 되돌릴 수 없어 한 번 더 묻는다.
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const shown = preview ?? rating
  const length = content.trim().length

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: lectureKeys.reviews(lectureId),
      }),
      queryClient.invalidateQueries({
        queryKey: lectureKeys.detail(lectureId),
      }),
    ])

  const save = useMutation({
    mutationFn: async (input: ReviewInput) => {
      if (review) await updateReview(review.reviewId, input)
      else await createReview(lectureId, orderItemId, input)
    },
    onSuccess: () => {
      toast(review ? '리뷰를 고쳤어요.' : '리뷰를 등록했어요.')
      onDone()
    },
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })

  const remove = useMutation({
    mutationFn: () => deleteReview(review!.reviewId),
    onSuccess: () => {
      toast('리뷰를 지웠어요.')
      onDone()
    },
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })

  return (
    <>
      <form
        className={`panel form ${styles.form}`}
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({ rating, content: content.trim() })
        }}
      >
        <div className="field">
          <span className={styles.label} id="review-rating">
            별점
          </span>
          <div
            className={styles.stars}
            role="radiogroup"
            aria-labelledby="review-rating"
            onPointerLeave={() => setPreview(null)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === rating}
                aria-label={`${n}점`}
                className={
                  n <= shown ? `${styles.star} ${styles.on}` : styles.star
                }
                onPointerEnter={() => setPreview(n)}
                onClick={() => setRating(n)}
              >
                <span aria-hidden="true">★</span>
              </button>
            ))}
            <span className={styles.score} aria-hidden="true">
              <b className="num">{shown}</b>
              <span className="num">/5</span>
            </span>
            <span className={styles.verdict}>{LABEL[shown]}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="review-content">리뷰</label>
          <textarea
            id="review-content"
            className={`textarea ${styles.textarea}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="어떤 점이 도움이 됐는지, 어떤 분께 추천하는지 알려 주세요"
          />
          <span className="fine">
            <span className={length > 0 ? `num ${styles.countOn}` : 'num'}>
              {length}자
            </span>{' '}
            · 내용은 선택 사항이에요.
          </span>
        </div>
        <div className={styles.actions}>
          {review && (
            <button
              type="button"
              className="btn danger"
              disabled={remove.isPending}
              onClick={() => setConfirmingRemove(true)}
            >
              리뷰 지우기
            </button>
          )}
          <span className={styles.spacer} />
          <button type="button" className="btn ghost" onClick={onCancel}>
            취소
          </button>
          <button
            type="submit"
            className={`btn primary ${styles.submit}`}
            disabled={save.isPending || remove.isPending}
            aria-busy={save.isPending}
          >
            {save.isPending && (
              <span className="spinner sm" aria-hidden="true" />
            )}
            {review ? '리뷰 고치기' : '리뷰 등록'}
          </button>
        </div>
        <p className="fine">
          강의 내용 다름 이의 제기로 결제가 반환되면 리뷰는 남지만 평균
          평점에서는 빠져요.
        </p>
      </form>
      {confirmingRemove && (
        <RemoveConfirm
          pending={remove.isPending}
          onClose={() => setConfirmingRemove(false)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onError: () => setConfirmingRemove(false),
            })
          }
        />
      )}
    </>
  )
}

/** 리뷰 지우기 확인. 지우는 중에는 닫지 않는다(성공하면 화면을 떠난다) */
function RemoveConfirm({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const close = () => {
    if (!pending) onClose()
  }
  return (
    <Modal
      title="리뷰를 지울까요?"
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className="btn ghost"
            disabled={pending}
            onClick={close}
          >
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={pending}
            onClick={onConfirm}
          >
            지우기
          </button>
        </>
      }
    >
      <p>지운 리뷰는 되돌릴 수 없어요.</p>
    </Modal>
  )
}
