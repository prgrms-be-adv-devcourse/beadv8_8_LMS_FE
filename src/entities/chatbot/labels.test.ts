import { afterEach, describe, expect, it, vi } from 'vitest'
import { influencerReasonText, isFaqCategory } from './labels'

afterEach(() => vi.restoreAllMocks())

describe('챗봇 코드 값', () => {
  it('인플루언서 이유는 아는 첫 코드의 문장이고, 모두 모르면 없다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(influencerReasonText(['NEW_REASON', 'PAST_PARTNER'])).toBe(
      '예전에 함께 출연했던 인플루언서예요',
    )
    expect(influencerReasonText(['NEW_REASON'])).toBeUndefined()
    expect(influencerReasonText([])).toBeUndefined()
  })

  it('FAQ 분류 코드만 분류로 본다', () => {
    expect(isFaqCategory('HP')).toBe(true)
    expect(isFaqCategory('NOPE')).toBe(false)
    expect(isFaqCategory(null)).toBe(false)
  })
})
