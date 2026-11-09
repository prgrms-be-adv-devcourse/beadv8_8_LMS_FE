import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  changeCouponStatus,
  couponKeys,
  createPlatformCoupon,
  rejectCoupon,
  type AdminCouponAction,
} from '@/entities/coupon/api'
import type { Coupon, CouponCreateInput } from '@/entities/coupon/types'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'
import {
  forgetRetry,
  isRetryableFailure,
  rememberRetry,
  RETRYABLE,
  type RetryableAction,
} from './retryStore'

/** 관리자 쿠폰 목록·상세 전체. 조작 뒤 함께 다시 불러온다 */
const ADMIN_KEY = [...couponKeys.all, 'admin'] as const

/** 버튼 문구와 성공 안내 */
export const ACTION_TEXT: Record<
  AdminCouponAction,
  { label: string; done: string }
> = {
  open: { label: '열기', done: '쿠폰을 열었어요. 지금부터 발급돼요.' },
  approve: { label: '승인', done: '승인했어요. 지금부터 발급돼요.' },
  suspend: {
    label: '중단',
    done: '발급을 중단했어요. 이미 받은 쿠폰은 쓸 수 있어요.',
  },
  resume: { label: '재개', done: '발급을 다시 시작했어요.' },
  close: { label: '종료', done: '쿠폰을 종료했어요.' },
}

/**
 * 조작 실패 문구. 화면 분기는 code로만 한다.
 * - 예산 거절(409 PROMOTION_BUDGET_REJECTED): 상태는 그대로라 같은 버튼으로 다시 시도한다
 * - 동시 변경(409 COUPON_CONCURRENT_UPDATE): 다른 변경이 먼저 반영됐다. 목록·상세는 끝나면 다시 불러온다
 * - 5xx: 잠깐 쓸 수 없는 상태(예산·강의 조회 등)
 * - 응답을 받지 못함(네트워크): BE가 처리했는지 모르므로 다시 시도하게 한다
 */
export function couponActionMessage(
  error: unknown,
  action?: AdminCouponAction | 'reject',
) {
  if (isApiError(error, 'PROMOTION_BUDGET_REJECTED'))
    return action === 'approve'
      ? '예산을 확보하지 못했어요. 다시 승인해 주세요.'
      : '예산을 확보하지 못했어요. 다시 열어 주세요.'
  if (isApiError(error, 'COUPON_CONCURRENT_UPDATE'))
    return '다른 변경과 겹쳤어요. 다시 시도해 주세요.'
  if (isApiError(error, 'INVALID_COUPON_STATUS'))
    return '지금 상태에서는 할 수 없어요. 새로 불러온 상태를 확인해 주세요.'
  if (isApiError(error) && error.status >= 500)
    return '잠시 후 다시 시도해 주세요.'
  if (isApiError(error)) return error.message
  return '응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 성공한 응답(CouponView)으로 상세 캐시를 바로 바꾸고, 끝나면 관리자 목록·상세를 다시 불러온다.
 * 성공 안내는 여기서 띄운다: 다시 불러온 목록에서 그 쿠폰이 빠지면(필터 밖 상태) 버튼이 사라져 mutate()에 넘긴 콜백은 불리지 않는다
 */
function useSettle() {
  const queryClient = useQueryClient()
  return {
    saved: (coupon: Coupon, message?: string) => {
      queryClient.setQueryData(couponKeys.adminDetail(coupon.couponId), coupon)
      if (message) toast(message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY }),
  }
}

/**
 * 열기·승인·중단·재개·종료. name은 실패한 열기·승인·재개를 다시 시도하라고 안내할 때 쓴다.
 * 열기·승인·재개가 다시 보내면 마무리될 수 있는 오류(isRetryableFailure)로 실패하면 다시 시도할 조작으로 기억하고
 * (BE가 상태를 먼저 저장했을 수 있다), 성공하면 지운다.
 */
export function useAdminCouponAction(couponId: number, name: string) {
  const { saved, onSettled } = useSettle()
  return useMutation({
    mutationFn: (action: AdminCouponAction) =>
      changeCouponStatus(couponId, action),
    onSuccess: (coupon, action) => {
      forgetRetry(couponId)
      saved(coupon, ACTION_TEXT[action].done)
    },
    onError: (error, action) => {
      if (!RETRYABLE.has(action)) return
      // 다시 보내도 같은 실패(상태 불일치·권한·없음)는 기록하지 않고, 남은 기록도 지운다. 문구는 버튼 아래에 바로 보인다.
      if (!isRetryableFailure(error)) return forgetRetry(couponId)
      rememberRetry(couponId, {
        action: action as RetryableAction,
        name,
        message: couponActionMessage(error, action),
      })
    },
    onSettled,
  })
}

/** 반려(사유 1~500자) */
export function useRejectCoupon(couponId: number) {
  const { saved, onSettled } = useSettle()
  return useMutation({
    mutationFn: (reason: string) => rejectCoupon(couponId, reason),
    onSuccess: (coupon) => saved(coupon, '반려했어요.'),
    onSettled,
  })
}

/** 플랫폼 쿠폰 생성(DRAFT). 열기 전까지는 발급되지 않는다 */
export function useCreatePlatformCoupon() {
  const { saved, onSettled } = useSettle()
  return useMutation({
    mutationFn: (input: CouponCreateInput) => createPlatformCoupon(input),
    onSuccess: (coupon) =>
      saved(coupon, '쿠폰을 만들었어요. 열면 발급이 시작돼요.'),
    onSettled,
  })
}
