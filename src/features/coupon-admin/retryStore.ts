import { create } from 'zustand'
import type { AdminCouponAction } from '@/entities/coupon/api'

/** 실패하면 같은 요청을 다시 보내 마무리하는 조작(발급을 여는 쪽) */
export type RetryableAction = Extract<
  AdminCouponAction,
  'open' | 'approve' | 'resume'
>
export const RETRYABLE = new Set<AdminCouponAction>([
  'open',
  'approve',
  'resume',
])

export type PendingRetry = {
  action: RetryableAction
  /** 목록에서 빠진 쿠폰도 안내할 수 있게 이름을 함께 둔다 */
  name: string
  message: string
}

/**
 * 열기·승인·재개가 실패한 쿠폰(키: couponId).
 * BE는 상태(OPEN)를 먼저 저장한 뒤 발급 저장소(Redis)를 바꾸다 503으로 실패할 수 있고, 같은 요청을 다시 보내면
 * 마무리된다. 다시 불러온 상태가 이미 OPEN이면 원래 버튼이 사라지므로, 성공할 때까지 이 기록으로 '다시 시도'를 남긴다.
 * 쿠폰 상세·목록이 모두 보도록 화면 밖(모듈)에 둔다.
 */
export const useCouponRetryStore = create<Record<number, PendingRetry>>(
  () => ({}),
)

export function rememberRetry(couponId: number, retry: PendingRetry) {
  useCouponRetryStore.setState({ [couponId]: retry })
}

export function forgetRetry(couponId: number) {
  const current = useCouponRetryStore.getState()
  if (!(couponId in current)) return
  const next = { ...current }
  delete next[couponId]
  useCouponRetryStore.setState(next, true)
}

/** 테스트용: 남은 기록을 모두 지운다(모듈 전역이라 테스트 사이에 남는다) */
export function resetCouponRetries() {
  useCouponRetryStore.setState({}, true)
}
