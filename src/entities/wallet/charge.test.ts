import { describe, expect, it } from 'vitest'
import {
  chargeAmountError,
  chargeAmountForShort,
  chargeHref,
  chargeReturnUrls,
  parseChargeAmountParam,
  parseChargeReturn,
} from './charge'

describe('충전 금액', () => {
  it('충전 금액은 1,000 이상·1,000 단위여야 한다', () => {
    expect(chargeAmountError(0)).toBe('충전할 금액을 입력해 주세요.')
    expect(chargeAmountError(500)).toBe('최소 1,000원부터 충전할 수 있어요.')
    expect(chargeAmountError(1500)).toBe('1,000원 단위로 입력해 주세요.')
    expect(chargeAmountError(1000)).toBeNull()
    expect(chargeAmountError(30000)).toBeNull()
  })

  it('부족분은 1,000 단위로 올려 충전 금액으로 쓴다', () => {
    expect(chargeAmountForShort(300)).toBe(1000)
    expect(chargeAmountForShort(5000)).toBe(5000)
    expect(chargeAmountForShort(5001)).toBe(6000)
    expect(chargeHref(5001)).toBe('/wallet?charge=6000')
  })

  it('주소의 charge 값은 올바른 충전 금액일 때만 쓴다', () => {
    expect(parseChargeAmountParam('6000')).toBe(6000)
    expect(parseChargeAmountParam(null)).toBeNull()
    expect(parseChargeAmountParam('')).toBeNull()
    expect(parseChargeAmountParam('1500')).toBeNull()
    expect(parseChargeAmountParam('abc')).toBeNull()
    expect(parseChargeAmountParam('-1000')).toBeNull()
  })
})

describe('결제 결과 주소', () => {
  it('성공은 결과 화면으로, 실패는 금액을 붙여 결과 화면으로 돌아온다', () => {
    expect(chargeReturnUrls('https://hb.test', 30000)).toEqual({
      successUrl: 'https://hb.test/wallet/charge/result',
      failUrl: 'https://hb.test/wallet/charge/result?amount=30000',
    })
  })

  it('결과 쿼리를 성공·실패·없음으로 나눈다', () => {
    expect(
      parseChargeReturn(
        new URLSearchParams(
          'paymentType=NORMAL&orderId=HPCHG-1&paymentKey=pk_1&amount=30000',
        ),
      ),
    ).toEqual({
      kind: 'success',
      orderId: 'HPCHG-1',
      paymentKey: 'pk_1',
      amount: 30000,
    })
    expect(
      parseChargeReturn(
        new URLSearchParams(
          'amount=30000&code=PAY_PROCESS_CANCELED&message=취소&orderId=HPCHG-1',
        ),
      ),
    ).toEqual({
      kind: 'fail',
      code: 'PAY_PROCESS_CANCELED',
      message: '취소',
      orderId: 'HPCHG-1',
      amount: 30000,
    })
    expect(
      parseChargeReturn(new URLSearchParams('code=REJECT_CARD_PAYMENT')),
    ).toEqual({
      kind: 'fail',
      code: 'REJECT_CARD_PAYMENT',
      message: null,
      orderId: null,
      amount: null,
    })
    expect(parseChargeReturn(new URLSearchParams(''))).toBeNull()
    // 승인에 필요한 값이 빠지면 결과로 보지 않는다
    expect(
      parseChargeReturn(new URLSearchParams('paymentKey=pk_1&orderId=HPCHG-1')),
    ).toBeNull()
  })
})
