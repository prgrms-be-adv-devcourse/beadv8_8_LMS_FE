import { describe, expect, it } from 'vitest'
import { saleShareLabel } from './sale'

describe('판매 할인 부담 몫', () => {
  it('할인이 없으면 표시하지 않는다', () => {
    expect(
      saleShareLabel({
        discountHp: 0,
        sellerDiscountHp: 0,
        platformDiscountHp: 0,
      }),
    ).toBeNull()
  })

  it('판매자 부담과 플랫폼 부담을 나눠 보인다', () => {
    expect(
      saleShareLabel({
        discountHp: 4500,
        sellerDiscountHp: 3000,
        platformDiscountHp: 1500,
      }),
    ).toBe('판매자 부담 3,000 · 플랫폼 부담 1,500')
  })
})
