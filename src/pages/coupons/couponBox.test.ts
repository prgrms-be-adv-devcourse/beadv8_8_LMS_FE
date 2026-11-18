import { describe, expect, it } from 'vitest'
import type { MemberCouponStatus } from '@/entities/coupon/types'
import { memberCoupon } from '@/test/couponMock'
import { isExpiringSoon, splitCoupons, viewOf } from './couponBox'

const NOW = new Date('2026-11-18T03:00:00Z')

describe('쿠폰함 보기 나누기', () => {
  it('사용 가능·사용 중은 사용 가능 보기, 사용 완료·만료·모르는 상태는 지난 쿠폰이다', () => {
    const viewFor = (status: string) =>
      viewOf(memberCoupon({ status: status as MemberCouponStatus }))
    expect(viewFor('AVAILABLE')).toBe('usable')
    expect(viewFor('RESERVED')).toBe('usable')
    expect(viewFor('USED')).toBe('past')
    expect(viewFor('EXPIRED')).toBe('past')
    expect(viewFor('SOMETHING_NEW')).toBe('past')
  })

  it('곧 만료는 쓸 수 있고 지나지 않았으며 3일 안에 끝나는 쿠폰이다', () => {
    const at = (expiresAt: string, status: MemberCouponStatus = 'AVAILABLE') =>
      isExpiringSoon(memberCoupon({ expiresAt, status }), NOW)
    expect(at('2026-11-21T14:00:00Z')).toBe(true)
    expect(at('2026-11-22T01:00:00Z')).toBe(false)
    expect(at('2026-11-18T02:00:00Z')).toBe(false)
    expect(at('2026-11-20T00:00:00Z', 'RESERVED')).toBe(false)
  })

  it('요약 수를 세고, 사용 가능 보기는 만료가 가까운 순·사용 중은 뒤에 둔다', () => {
    const result = splitCoupons(
      [
        memberCoupon({ memberCouponId: 1, expiresAt: '2026-12-30T00:00:00Z' }),
        memberCoupon({
          memberCouponId: 2,
          status: 'RESERVED',
          expiresAt: '2026-11-19T00:00:00Z',
        }),
        memberCoupon({ memberCouponId: 3, expiresAt: '2026-11-20T00:00:00Z' }),
        memberCoupon({ memberCouponId: 4, status: 'USED' }),
      ],
      NOW,
    )
    expect(result.usable.map((c) => c.memberCouponId)).toEqual([3, 1, 2])
    expect(result.past.map((c) => c.memberCouponId)).toEqual([4])
    expect(result.available).toBe(2)
    expect(result.expiring).toBe(1)
  })
})
