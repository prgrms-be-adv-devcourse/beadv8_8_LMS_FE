import { describe, expect, it } from 'vitest'
import { couponSummary } from '@/test/couponMock'
import {
  bulkResultMessage,
  bulkResultOf,
  canRequestIssue,
  entryLabelOf,
  IDLE,
  tallyIssues,
} from './issueView'
import type { IssueCouponState } from './useIssueCoupon'

const failed = (code: string | null): IssueCouponState => ({
  phase: 'failed',
  message: '실패',
  code,
})

describe('받을 수 있는 쿠폰 판정', () => {
  it('요청 전이면 목록의 받음·소진을 따르고, 처리 중·발급 거절은 다시 보내지 않는다', () => {
    expect(canRequestIssue(couponSummary(), IDLE)).toBe(true)
    expect(canRequestIssue(couponSummary({ issued: true }), IDLE)).toBe(false)
    expect(canRequestIssue(couponSummary({ soldOut: true }), IDLE)).toBe(false)
    expect(canRequestIssue(couponSummary(), { phase: 'processing' })).toBe(
      false,
    )
    expect(
      canRequestIssue(couponSummary(), { phase: 'rejected', reason: null }),
    ).toBe(false)
  })

  it('접수 실패·처리 지연·확인 불가는 같은 요청 ID로 다시 보낼 수 있고, 소진·이미 받음 실패는 막는다', () => {
    expect(canRequestIssue(couponSummary(), failed(null))).toBe(true)
    expect(canRequestIssue(couponSummary(), { phase: 'delayed' })).toBe(true)
    expect(canRequestIssue(couponSummary(), { phase: 'unknown' })).toBe(true)
    expect(canRequestIssue(couponSummary(), failed('COUPON_SOLD_OUT'))).toBe(
      false,
    )
    expect(
      canRequestIssue(couponSummary(), failed('COUPON_ALREADY_ISSUED')),
    ).toBe(false)
    // 목록이 받음으로 바뀌어도 응답을 놓친 요청은 다시 보낼 수 있다.
    expect(canRequestIssue(couponSummary({ issued: true }), failed(null))).toBe(
      true,
    )
  })
})

describe('쿠폰 받기 버튼 글자', () => {
  const coupons = [
    couponSummary({ couponId: 1 }),
    couponSummary({ couponId: 2, issued: true }),
    couponSummary({ couponId: 3, soldOut: true }),
  ]

  it('받을 수 있는 쿠폰이 있으면 그 수를, 없으면 받은 수를, 둘 다 없으면 전체 수를 보인다', () => {
    const before = tallyIssues(coupons, () => IDLE)
    expect(before.requestable.map((c) => c.couponId)).toEqual([1])
    expect(before.received).toBe(1)
    expect(entryLabelOf(before, 3)).toEqual({ label: '쿠폰 받기', count: 1 })

    const after = tallyIssues(coupons, (id) =>
      id === 1 ? { phase: 'issued', expiresAt: null } : IDLE,
    )
    expect(entryLabelOf(after, 3)).toEqual({ label: '받은 쿠폰', count: 2 })

    const none = tallyIssues([couponSummary({ soldOut: true })], () => IDLE)
    expect(entryLabelOf(none, 1)).toEqual({ label: '쿠폰 보기', count: 1 })
  })
})

describe('모두 받기 결과', () => {
  it('받음(이미 받음 포함)·처리 중·실패(사라진 쿠폰 포함)로 세어 알린다', () => {
    const result = bulkResultOf([
      { phase: 'issued', expiresAt: null },
      failed('COUPON_ALREADY_ISSUED'),
      { phase: 'delayed' },
      failed('COUPON_SOLD_OUT'),
      null,
    ])
    expect(result).toEqual({ issued: 2, waiting: 1, failed: 2 })
    expect(bulkResultMessage(result)).toBe(
      '2장 받았어요 · 1장은 아직 처리 중이에요 · 2장은 받지 못했어요',
    )
    expect(bulkResultMessage({ issued: 3, waiting: 0, failed: 0 })).toBe(
      '3장 받았어요',
    )
  })
})
