import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  couponKeys,
  requestCouponReview,
  suspendSellerCoupon,
} from '@/entities/coupon/api'
import type { Coupon } from '@/entities/coupon/types'
import { isApiError } from '@/shared/api/ApiError'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'

type SellerAction = 'review' | 'suspend'

const DONE: Record<SellerAction, string> = {
  review: '심사를 요청했어요. 승인되면 발급이 시작돼요.',
  suspend: '발급을 멈췄어요. 이미 받은 쿠폰은 계속 쓸 수 있어요.',
}

/** 실패 문구는 code로 고른다. 모르는 code는 서버 문구 그대로 */
function failureMessage(error: Error) {
  if (isApiError(error, 'INVALID_COUPON_STATUS'))
    return '지금 상태에서는 할 수 없어요. 최신 상태를 다시 불러왔어요.'
  if (isApiError(error, 'COUPON_CONCURRENT_UPDATE'))
    return '다른 변경과 겹쳤어요. 잠시 후 다시 시도해 주세요.'
  return error.message
}

/** 판매자 쿠폰 조작(심사 요청·발급 중단). 끝나면 판매자 쿠폰 목록·상세를 다시 불러온다 */
function useSellerCouponAction(onDone?: (coupon: Coupon) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      couponId,
      action,
    }: {
      couponId: number
      action: SellerAction
    }) =>
      action === 'review'
        ? requestCouponReview(couponId)
        : suspendSellerCoupon(couponId),
    onSuccess: (coupon, { action }) => {
      queryClient.setQueryData(couponKeys.sellerDetail(coupon.couponId), coupon)
      toast(DONE[action])
      onDone?.(coupon)
    },
    onError: (error) => toast(failureMessage(error)),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [...couponKeys.all, 'seller'],
      }),
  })
}

/**
 * 상태별 판매자 버튼: 신청됨(DRAFT)은 '심사 요청', 발급 중(OPEN)은 '중단'(확인 뒤).
 * 중단한 쿠폰을 다시 여는 것(resume)은 관리자만 할 수 있어 중단은 한 번 더 묻는다.
 */
export function SellerCouponActions({
  coupon,
  onDone,
}: {
  coupon: Coupon
  onDone?: (coupon: Coupon) => void
}) {
  const action = useSellerCouponAction(onDone)
  const [confirming, setConfirming] = useState(false)
  const run = (next: SellerAction) =>
    action.mutate({ couponId: coupon.couponId, action: next })

  if (coupon.status === 'DRAFT')
    return (
      <button
        type="button"
        className="btn sm primary"
        disabled={action.isPending}
        onClick={() => run('review')}
      >
        심사 요청
      </button>
    )
  if (coupon.status !== 'OPEN') return null
  return (
    <>
      <button
        type="button"
        className="btn sm"
        disabled={action.isPending}
        onClick={() => setConfirming(true)}
      >
        중단
      </button>
      {confirming && (
        <Modal
          title="쿠폰 발급 중단"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={action.isPending}
                onClick={() => {
                  setConfirming(false)
                  run('suspend')
                }}
              >
                발급 중단
              </button>
            </>
          }
        >
          <p>
            <b>{coupon.name}</b> 발급을 멈출까요? 판매자는 다시 열 수 없어요.
            이미 받은 쿠폰은 만료 전까지 쓸 수 있어요.
          </p>
        </Modal>
      )}
    </>
  )
}
