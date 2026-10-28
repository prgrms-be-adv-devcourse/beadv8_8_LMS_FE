import { describe, expect, it } from 'vitest'
import {
  canExchange,
  defaultExchangeAmount,
  estimateExchangeFee,
  exchangeAccountErrors,
  exchangeAmountError,
  formatSettlementDate,
} from './exchange'

describe('exchangeAmountError', () => {
  it('금액은 1,000 HP 이상·1,000 HP 단위이고 가용 수익 HP를 넘을 수 없다', () => {
    expect(exchangeAmountError(0, 10000)).toBe('환전할 HP를 입력해 주세요.')
    expect(exchangeAmountError(999, 10000)).toBe(
      '1,000 HP 이상부터 환전할 수 있어요.',
    )
    expect(exchangeAmountError(1500, 10000)).toBe(
      '1,000 HP 단위로 입력해 주세요.',
    )
    expect(exchangeAmountError(11000, 10000)).toBe(
      '환전할 수 있는 수익 HP(10,000)를 넘었어요.',
    )
    expect(exchangeAmountError(1000, 10000)).toBeNull()
    expect(exchangeAmountError(10000, 10000)).toBeNull()
  })
})

describe('exchangeAccountErrors', () => {
  const valid = {
    bankCode: '004',
    accountNumber: '12345678',
    holderName: '홍길동',
  }

  it('올바른 계좌는 오류가 없다', () => {
    expect(exchangeAccountErrors(valid)).toEqual({})
    expect(
      exchangeAccountErrors({
        ...valid,
        accountNumber: '1'.repeat(20),
        holderName: ` ${'가'.repeat(50)} `,
      }),
    ).toEqual({})
  })

  it('은행 코드 3자리, 계좌번호 8~20자리, 예금주 앞뒤 공백 제외 1~50자를 검사한다', () => {
    expect(exchangeAccountErrors({ ...valid, bankCode: '04' }).bankCode).toBe(
      '은행 코드는 숫자 3자리로 입력해 주세요.',
    )
    expect(
      exchangeAccountErrors({ ...valid, bankCode: '0040' }).bankCode,
    ).toBeDefined()
    expect(
      exchangeAccountErrors({ ...valid, accountNumber: '1234567' })
        .accountNumber,
    ).toBe('계좌번호는 숫자 8~20자리로 입력해 주세요.')
    expect(
      exchangeAccountErrors({ ...valid, accountNumber: '1'.repeat(21) })
        .accountNumber,
    ).toBeDefined()
    expect(
      exchangeAccountErrors({ ...valid, holderName: '   ' }).holderName,
    ).toBe('예금주를 입력해 주세요.')
    expect(
      exchangeAccountErrors({ ...valid, holderName: '가'.repeat(51) })
        .holderName,
    ).toBe('예금주는 50자까지 입력할 수 있어요.')
  })
})

describe('estimateExchangeFee', () => {
  it('예상 수수료는 신청 금액의 10%, 원 미만 버림이다', () => {
    expect(estimateExchangeFee(10000)).toBe(1000)
    expect(estimateExchangeFee(1000)).toBe(100)
    expect(estimateExchangeFee(0)).toBe(0)
  })
})

describe('defaultExchangeAmount·canExchange', () => {
  it('처음 금액은 수익 HP를 1,000 단위로 내린 값이고, 1,000 HP부터 신청할 수 있다', () => {
    expect(defaultExchangeAmount(43500)).toBe(43000)
    expect(defaultExchangeAmount(999)).toBe(0)
    expect(canExchange(999)).toBe(false)
    expect(canExchange(1000)).toBe(true)
  })
})

describe('formatSettlementDate', () => {
  it('정산 예정일은 날짜만 와도 KST 날짜로 표시한다', () => {
    expect(formatSettlementDate('2026-10-12')).toBe('10/12(월)')
    expect(formatSettlementDate('2026-11-10')).toBe('11/10(화)')
  })
})
