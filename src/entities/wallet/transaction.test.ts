import { describe, expect, it } from 'vitest'
import { changedBuckets, formatSignedHp, transactionLink } from './transaction'
import type { WalletTransaction } from './types'

const zero = { availableChangeHp: 0, heldChangeHp: 0, totalChangeHp: 0 }

const tx = (patch: Partial<WalletTransaction> = {}): WalletTransaction => ({
  transactionId: 1,
  type: 'CHARGE',
  displayName: 'HP 충전',
  referenceType: 'POINT_CHARGE',
  referenceId: 7,
  occurredAt: '2026-10-18T05:00:00Z',
  ...zero,
  charge: zero,
  revenue: zero,
  ...patch,
})

describe('formatSignedHp', () => {
  it('가용 증감에 부호를 붙여 +1,000 / −1,000으로 쓴다', () => {
    expect(formatSignedHp(1000)).toBe('+1,000')
    expect(formatSignedHp(-30000)).toBe('−30,000')
    expect(formatSignedHp(0)).toBe('0')
  })
})

describe('changedBuckets', () => {
  it('충전·수익 중 바뀐 HP 종류만 고른다', () => {
    const change = {
      availableChangeHp: -1000,
      heldChangeHp: 1000,
      totalChangeHp: 0,
    }
    expect(changedBuckets(tx({ charge: change }))).toEqual(['charge'])
    expect(changedBuckets(tx({ revenue: change }))).toEqual(['revenue'])
    expect(changedBuckets(tx({ charge: change, revenue: change }))).toEqual([
      'charge',
      'revenue',
    ])
    expect(changedBuckets(tx())).toEqual([])
  })
})

describe('transactionLink', () => {
  it('출연 요청서·모집글 참조만 링크를 만들고 나머지는 null이다', () => {
    expect(
      transactionLink(
        tx({ referenceType: 'APPEARANCE_REQUEST', referenceId: 3 }),
      ),
    ).toEqual({ to: '/appearances/requests/3', label: '출연 요청서 보기' })
    expect(
      transactionLink(
        tx({ referenceType: 'APPEARANCE_RECRUIT', referenceId: 4 }),
      ),
    ).toEqual({ to: '/recruits/4', label: '모집글 보기' })
    for (const referenceType of [
      'LECTURE_ORDER',
      'LECTURE_ORDER_ITEM',
      'RECRUIT_APPEARANCE',
      'POINT_CHARGE',
      'POINT_REFUND_REQUEST',
      'EXCHANGE',
      'SETTLEMENT',
    ] as const) {
      expect(transactionLink(tx({ referenceType }))).toBeNull()
    }
  })
})
