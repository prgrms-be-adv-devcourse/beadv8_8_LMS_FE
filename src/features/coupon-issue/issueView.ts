import type { CouponSummary } from '@/entities/coupon/types'
import { formatDate } from '@/shared/lib/date'
import {
  ISSUE_DELAYED_MESSAGE,
  ISSUE_UNKNOWN_MESSAGE,
  type IssueCouponState,
} from './useIssueCoupon'

export type IssueButtonView = {
  label: '받음' | '소진' | '발급받기'
  disabled: boolean
}

/** 아직 이 화면에서 요청하지 않은 쿠폰의 상태 */
export const IDLE: IssueCouponState = { phase: 'idle' }

/** 쿠폰 한 장의 발급 버튼. 소진이면 '소진', 이미 받았으면 '받음'으로 막는다 */
export function issueButtonOf(
  coupon: CouponSummary,
  state: IssueCouponState,
): IssueButtonView {
  const failedWith = state.phase === 'failed' ? state.code : null
  // 목록의 받음·소진은 이 화면에서 아직 요청하지 않았을 때만 따른다. 받음에는 접수만 된 요청도 들어 있어,
  // 응답을 놓친 요청을 같은 ID로 다시 보낼 길을 막지 않도록 요청을 보낸 뒤에는 훅의 상태를 따른다.
  const untouched = state.phase === 'idle'
  if (
    (untouched && coupon.issued) ||
    state.phase === 'issued' ||
    failedWith === 'COUPON_ALREADY_ISSUED'
  )
    return { label: '받음', disabled: true }
  if ((untouched && coupon.soldOut) || failedWith === 'COUPON_SOLD_OUT')
    return { label: '소진', disabled: true }
  // 처리 중에는 다시 보내지 않고, 발급 거절은 다시 눌러도 결과가 같다.
  return {
    label: '발급받기',
    disabled: state.phase === 'processing' || state.phase === 'rejected',
  }
}

/** 버튼 아래 진행·결과 안내. 요청 전이면 빈 문자열 */
export function issueMessageOf(state: IssueCouponState): string {
  switch (state.phase) {
    case 'idle':
      return ''
    case 'processing':
      return '처리 중…'
    case 'issued':
      return state.expiresAt
        ? `발급 완료 · ${formatDate(state.expiresAt)}까지 쓸 수 있어요`
        : '발급 완료'
    case 'rejected':
      return state.reason
        ? `발급되지 않았습니다. ${state.reason}`
        : '발급되지 않았습니다'
    case 'delayed':
      return ISSUE_DELAYED_MESSAGE
    case 'unknown':
      return ISSUE_UNKNOWN_MESSAGE
    case 'failed':
      return state.message
  }
}

/** 지금 눌러 받을 수 있는 쿠폰(아직 안 받았고, 소진·처리 중·발급 거절이 아님). '모두 받기'가 차례로 보낸다 */
export const canRequestIssue = (
  coupon: CouponSummary,
  state: IssueCouponState,
) => {
  const view = issueButtonOf(coupon, state)
  return view.label === '발급받기' && !view.disabled
}

export type IssueTally = {
  /** 지금 받을 수 있는 쿠폰 */
  requestable: CouponSummary[]
  /** 받은 쿠폰 수(이전에 받은 것 포함) */
  received: number
}

/** 강의 쿠폰 목록을 받을 수 있는 것과 받은 것으로 센다 */
export function tallyIssues(
  coupons: CouponSummary[],
  stateOf: (couponId: number) => IssueCouponState,
): IssueTally {
  const requestable: CouponSummary[] = []
  let received = 0
  for (const coupon of coupons) {
    const state = stateOf(coupon.couponId)
    if (canRequestIssue(coupon, state)) requestable.push(coupon)
    else if (issueButtonOf(coupon, state).label === '받음') received++
  }
  return { requestable, received }
}

/** 강의 상세 '쿠폰 받기' 버튼의 글자. 받을 것이 남았으면 받기, 다 받았으면 받은 수, 받을 수 없으면 보기 */
export function entryLabelOf(
  tally: IssueTally,
  total: number,
): { label: string; count: number } {
  if (tally.requestable.length > 0)
    return { label: '쿠폰 받기', count: tally.requestable.length }
  if (tally.received > 0) return { label: '받은 쿠폰', count: tally.received }
  return { label: '쿠폰 보기', count: total }
}

/** '모두 받기' 한 번의 결과 */
export type BulkResult = {
  issued: number
  /** 10번 봐도 처리 중이었다(쿠폰함에서 확인) */
  waiting: number
  /** 그 밖(소진·거절·접수 실패·확인 불가) */
  failed: number
}

/** 모두 받기가 끝난 쿠폰들의 상태를 센다. null은 도중에 목록에서 사라진 쿠폰이다 */
export function bulkResultOf(settled: (IssueCouponState | null)[]): BulkResult {
  const result: BulkResult = { issued: 0, waiting: 0, failed: 0 }
  for (const state of settled) {
    // 이미 받은 쿠폰(409)은 받은 것으로 센다(버튼도 '받음'이 된다).
    if (
      state?.phase === 'issued' ||
      (state?.phase === 'failed' && state.code === 'COUPON_ALREADY_ISSUED')
    )
      result.issued++
    else if (state?.phase === 'delayed') result.waiting++
    else result.failed++
  }
  return result
}

/** 모두 받기 결과 안내. 실패·처리 중 안내는 쿠폰마다 따로 보이므로 여기서는 수만 알린다 */
export function bulkResultMessage({
  issued,
  waiting,
  failed,
}: BulkResult): string {
  const parts: string[] = []
  if (issued > 0) parts.push(`${issued}장 받았어요`)
  if (waiting > 0) parts.push(`${waiting}장은 아직 처리 중이에요`)
  if (failed > 0) parts.push(`${failed}장은 받지 못했어요`)
  return parts.join(' · ')
}
