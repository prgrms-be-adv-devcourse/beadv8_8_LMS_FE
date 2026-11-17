import { describe, expect, it } from 'vitest'
import type { Recommendation } from '@/entities/chatbot/types'
import { shownRecommendation } from './shownRecommendation'

const rec = (
  patch: Partial<Recommendation<number>>,
): Recommendation<number> => ({
  items: [1],
  needsInterest: false,
  basis: 'PERSONALIZED',
  fallback: false,
  ...patch,
})

describe('위젯이 띠로 보여 줄 추천', () => {
  it('받지 못했거나 추천도 notice도 없으면 숨긴다', () => {
    expect(shownRecommendation(undefined)).toBeNull()
    expect(shownRecommendation(rec({ items: [] }))).toBeNull()
  })

  it('추천이 있거나 notice가 있으면 보인다', () => {
    const withItems = rec({})
    expect(shownRecommendation(withItems)).toBe(withItems)
    const withNotice = rec({ items: [], notice: '추천할 수 없어요.' })
    expect(shownRecommendation(withNotice)).toBe(withNotice)
  })
})
