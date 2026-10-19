import { describe, expect, it } from 'vitest'
import { earningStatusParam, parseEarningFilter } from './earning'

describe('earningStatusParam', () => {
  it('미지급 필터는 status를 보내지 않고 지급 완료·취소는 COMPLETED·CANCELED를 보낸다', () => {
    expect(earningStatusParam('unpaid')).toBeUndefined()
    expect(earningStatusParam('completed')).toBe('COMPLETED')
    expect(earningStatusParam('canceled')).toBe('CANCELED')
  })
})

describe('parseEarningFilter', () => {
  it('모르는 필터 값은 미지급으로 본다', () => {
    expect(parseEarningFilter(null)).toBe('unpaid')
    expect(parseEarningFilter('completed')).toBe('completed')
    expect(parseEarningFilter('canceled')).toBe('canceled')
    expect(parseEarningFilter('COMPLETED')).toBe('unpaid')
    expect(parseEarningFilter('unpaid')).toBe('unpaid')
  })
})
