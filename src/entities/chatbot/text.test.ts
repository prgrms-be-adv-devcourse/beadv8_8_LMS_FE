import { describe, expect, it } from 'vitest'
import { normalizeInterest, textLength, truncateText } from './text'

describe('챗봇 글자 수', () => {
  it('이모지를 한 글자로 센다(BE와 같은 코드 포인트 기준)', () => {
    expect(textLength('가a😀')).toBe(3)
    expect(truncateText('😀😀😀', 2)).toBe('😀😀')
    expect(truncateText('abc', 5)).toBe('abc')
  })

  it('관심사는 앞뒤 공백을 빼고 1~100자만 보낸다', () => {
    expect(normalizeInterest('  데이터 분석 ')).toBe('데이터 분석')
    expect(normalizeInterest('   ')).toBeNull()
    expect(normalizeInterest('가'.repeat(100))).toBe('가'.repeat(100))
    expect(normalizeInterest('가'.repeat(101))).toBeNull()
  })
})
