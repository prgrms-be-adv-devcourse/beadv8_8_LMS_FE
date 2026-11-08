import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/ApiError'
import {
  ISSUE_POLL_MAX,
  issueErrorMessage,
  issuePollDecision,
  needsSoldOutLookup,
  soldOutRetryOutcome,
} from './useIssueCoupon'

const problem = (status: number, code: string, detail = 'BE 문구') =>
  new ApiError(status, { status, code, detail })

describe('발급 상태 폴링 종료 판정', () => {
  it('ISSUED·REJECTED·UNKNOWN·NOT_FOUND면 멈춘다', () => {
    for (const status of [
      'ISSUED',
      'REJECTED',
      'UNKNOWN',
      'NOT_FOUND',
    ] as const) {
      expect(issuePollDecision(status, 1)).toBe('done')
      expect(issuePollDecision(status, ISSUE_POLL_MAX)).toBe('done')
    }
  })

  it('PENDING은 10번까지 다시 보고, 10번을 채우면 처리 중으로 끝낸다', () => {
    expect(issuePollDecision('PENDING', 1)).toBe('continue')
    expect(issuePollDecision('PENDING', ISSUE_POLL_MAX - 1)).toBe('continue')
    expect(issuePollDecision('PENDING', ISSUE_POLL_MAX)).toBe('timedOut')
    expect(issuePollDecision('PENDING', ISSUE_POLL_MAX + 1)).toBe('timedOut')
  })

  it('모르는 상태 값도 결과로 보고 멈춘다', () => {
    expect(issuePollDecision('SOMETHING_NEW', 1)).toBe('done')
  })

  it('응답이 아직 없으면 계속 보되, 조회 실패만 10번이어도 끝낸다', () => {
    expect(issuePollDecision(undefined, 0)).toBe('continue')
    expect(issuePollDecision(undefined, ISSUE_POLL_MAX)).toBe('timedOut')
  })
})

describe('발급 접수 오류 문구', () => {
  it('409는 BE 문구가 아니라 코드로 고른다', () => {
    expect(issueErrorMessage(problem(409, 'COUPON_SOLD_OUT'))).toBe(
      '모두 소진됐어요',
    )
    expect(issueErrorMessage(problem(409, 'COUPON_ALREADY_ISSUED'))).toBe(
      '이미 받은 쿠폰이에요',
    )
    expect(issueErrorMessage(problem(409, 'COUPON_ISSUE_NOT_IN_PERIOD'))).toBe(
      '발급 기간이 아니에요',
    )
    expect(issueErrorMessage(problem(409, 'COUPON_ISSUE_NOT_OPEN'))).toBe(
      '지금은 받을 수 없어요',
    )
  })

  it('503은 코드와 관계없이 잠시 뒤 다시, 그 밖은 오류 문구를 쓴다', () => {
    expect(issueErrorMessage(problem(503, 'COUPON_ISSUE_FAILED'))).toBe(
      '잠시 후 다시 시도해 주세요',
    )
    expect(
      issueErrorMessage(problem(503, 'COUPON_ISSUE_STORE_UNAVAILABLE')),
    ).toBe('잠시 후 다시 시도해 주세요')
    expect(issueErrorMessage(problem(404, 'COUPON_NOT_FOUND', '없음'))).toBe(
      '없음',
    )
    expect(issueErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '요청을 보내지 못했어요. 다시 눌러 주세요',
    )
  })
})

describe('같은 ID로 다시 보낸 요청의 소진', () => {
  it('다시 보낸 요청의 소진만 상태를 한 번 본다', () => {
    expect(needsSoldOutLookup(problem(409, 'COUPON_SOLD_OUT'), true)).toBe(true)
    expect(needsSoldOutLookup(problem(409, 'COUPON_SOLD_OUT'), false)).toBe(
      false,
    )
    expect(
      needsSoldOutLookup(problem(409, 'COUPON_ISSUE_NOT_OPEN'), true),
    ).toBe(false)
    expect(needsSoldOutLookup(new TypeError('Failed to fetch'), true)).toBe(
      false,
    )
  })

  it('접수 기록이 없으면(NOT_FOUND) 소진, 그 밖은 접수된 것으로 본다', () => {
    expect(soldOutRetryOutcome('NOT_FOUND')).toBe('soldOut')
    expect(soldOutRetryOutcome('PENDING')).toBe('accepted')
    expect(soldOutRetryOutcome('ISSUED')).toBe('accepted')
  })
})
