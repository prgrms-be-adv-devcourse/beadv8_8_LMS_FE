import { describe, expect, it } from 'vitest'
import { defaultRefundAmount, refundAmountError } from './refund'

describe('refundAmountError', () => {
  it('환불 금액은 1,000 HP 이상·1,000 단위·충전 HP 이하만 통과한다', () => {
    expect(refundAmountError(0, 10000)).toBe('환불할 금액을 입력해 주세요.')
    expect(refundAmountError(500, 10000)).toBe(
      '최소 1,000 HP부터 환불할 수 있어요.',
    )
    expect(refundAmountError(1500, 10000)).toBe(
      '1,000 HP 단위로 입력해 주세요.',
    )
    expect(refundAmountError(11000, 10000)).toBe(
      '충전 HP(10,000)까지만 환불할 수 있어요.',
    )
    expect(refundAmountError(3000, 10000)).toBeNull()
    expect(refundAmountError(10000, 10000)).toBeNull()
  })
})

describe('defaultRefundAmount', () => {
  it('기본 환불 금액은 충전 HP를 1,000 단위로 내린 값이다', () => {
    expect(defaultRefundAmount(12500)).toBe(12000)
    expect(defaultRefundAmount(1000)).toBe(1000)
    expect(defaultRefundAmount(999)).toBe(0)
  })
})
