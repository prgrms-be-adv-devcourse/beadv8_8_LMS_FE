import { describe, expect, it } from 'vitest'
import {
  discountLabel,
  expiryRuleLabel,
  kstInputToInstant,
  needsMaxDiscount,
  remainingOf,
  targetLabel,
  toCouponInput,
  validateCouponForm,
  type CouponFormValues,
} from './rules'

/** 2026-11-08 10:00 KST */
const NOW = Date.parse('2026-11-08T01:00:00Z')

const valid = (patch: Partial<CouponFormValues> = {}): CouponFormValues => ({
  name: '가을맞이 할인',
  targetType: 'LECTURE',
  lectureId: '7',
  discountType: 'RATE',
  discountValue: '10',
  maxDiscountAmount: '',
  quantity: '100',
  issueStartAt: '2026-11-09T10:00',
  issueEndAt: '2026-11-30T23:59',
  expiryType: 'RELATIVE',
  expiryDays: '30',
  fixedExpiresAt: '',
  stackable: false,
  ...patch,
})

describe('표시', () => {
  it('할인은 정률·정액, 최대 할인이 있으면 함께 보인다', () => {
    expect(
      discountLabel({
        discountType: 'RATE',
        discountValue: 10,
        maxDiscountAmount: null,
      }),
    ).toBe('10% 할인')
    expect(
      discountLabel({
        discountType: 'RATE',
        discountValue: 15,
        maxDiscountAmount: 5000,
      }),
    ).toBe('15% 할인 · 최대 5,000 HP')
    expect(
      discountLabel({
        discountType: 'AMOUNT',
        discountValue: 3000,
        maxDiscountAmount: null,
      }),
    ).toBe('3,000 HP 할인')
  })

  it('만료 방식은 받은 날부터 N일 또는 고정 날짜(KST)까지다', () => {
    expect(
      expiryRuleLabel({
        expiryType: 'RELATIVE',
        expiryDays: 30,
        fixedExpiresAt: null,
      }),
    ).toBe('받은 날부터 30일')
    // 2026-11-30 14:59 UTC = 11/30 23:59 KST
    expect(
      expiryRuleLabel({
        expiryType: 'FIXED',
        expiryDays: null,
        fixedExpiresAt: '2026-11-30T14:59:00Z',
      }),
    ).toBe('11/30(월)까지')
  })

  it('대상과 남은 수량', () => {
    expect(targetLabel('ANY_LECTURE')).toBe('모든 강의')
    expect(targetLabel('LECTURE', '썸네일 잘 만들기')).toBe('썸네일 잘 만들기')
    expect(targetLabel('LECTURE')).toBe('특정 강의')
    expect(remainingOf({ quantity: 100, issuedCount: 40 })).toBe(60)
    expect(remainingOf({ quantity: 10, issuedCount: 12 })).toBe(0)
  })
})

describe('모르는 종류 값', () => {
  it('BE가 새 종류를 더하면 기존 종류로 단정하지 않고 알 수 없음으로 보인다', () => {
    const NEW = 'BRAND_NEW' as never
    expect(
      discountLabel({
        discountType: NEW,
        discountValue: 10,
        maxDiscountAmount: null,
      }),
    ).toBe('알 수 없음')
    expect(
      expiryRuleLabel({
        expiryType: NEW,
        expiryDays: 30,
        fixedExpiresAt: null,
      }),
    ).toBe('알 수 없음')
    expect(targetLabel(NEW, '썸네일')).toBe('알 수 없음')
  })
})

describe('생성 폼 검증', () => {
  it('맞는 값이면 오류가 없다', () => {
    expect(validateCouponForm(valid(), NOW)).toEqual({})
  })

  it('정률은 1~100 정수만', () => {
    for (const value of ['0', '101', '10.5', ''])
      expect(
        validateCouponForm(valid({ discountValue: value }), NOW).discountValue,
      ).toBeDefined()
    expect(
      validateCouponForm(valid({ discountValue: '100' }), NOW).discountValue,
    ).toBeUndefined()
  })

  it('발급 시작은 종료보다 앞, 종료는 지금보다 뒤', () => {
    expect(
      validateCouponForm(
        valid({
          issueStartAt: '2026-11-30T23:59',
          issueEndAt: '2026-11-30T23:59',
        }),
        NOW,
      ).issueEndAt,
    ).toBe('발급 종료는 시작보다 뒤여야 해요.')
    expect(
      validateCouponForm(
        valid({
          issueStartAt: '2026-11-01T10:00',
          issueEndAt: '2026-11-08T09:00',
        }),
        NOW,
      ).issueEndAt,
    ).toBe('발급 종료는 지금보다 뒤여야 해요.')
  })

  it('고정 만료는 발급 종료보다 뒤, 상대 만료는 1~3,650일', () => {
    expect(
      validateCouponForm(
        valid({ expiryType: 'FIXED', fixedExpiresAt: '2026-11-30T23:59' }),
        NOW,
      ).fixedExpiresAt,
    ).toBe('만료 일시는 발급 종료보다 뒤여야 해요.')
    expect(
      validateCouponForm(
        valid({ expiryType: 'FIXED', fixedExpiresAt: '2026-12-31T23:59' }),
        NOW,
      ),
    ).toEqual({})
    expect(
      validateCouponForm(valid({ expiryDays: '0' }), NOW).expiryDays,
    ).toBeDefined()
    expect(
      validateCouponForm(valid({ expiryDays: '3651' }), NOW).expiryDays,
    ).toBeDefined()
  })

  it('모든 강의 정률이면 최대 할인 HP가 필요하다', () => {
    expect(needsMaxDiscount('ANY_LECTURE', 'RATE')).toBe(true)
    expect(needsMaxDiscount('ANY_LECTURE', 'AMOUNT')).toBe(false)
    expect(needsMaxDiscount('LECTURE', 'RATE')).toBe(false)
    expect(
      validateCouponForm(
        valid({ targetType: 'ANY_LECTURE', lectureId: '' }),
        NOW,
      ).maxDiscountAmount,
    ).toBeDefined()
    expect(
      validateCouponForm(
        valid({
          targetType: 'ANY_LECTURE',
          lectureId: '',
          maxDiscountAmount: '5000',
        }),
        NOW,
      ),
    ).toEqual({})
  })

  it('고정 만료는 발급 종료 뒤 3,650일 안이어야 한다(BE EXPIRY_TOO_LONG)', () => {
    expect(
      validateCouponForm(
        valid({ expiryType: 'FIXED', fixedExpiresAt: '2036-11-28T23:59' }),
        NOW,
      ).fixedExpiresAt,
    ).toBe('만료 일시는 발급 종료 뒤 3,650일 안이어야 해요.')
    expect(
      validateCouponForm(
        valid({ expiryType: 'FIXED', fixedExpiresAt: '2036-11-26T23:59' }),
        NOW,
      ).fixedExpiresAt,
    ).toBeUndefined()
  })

  it('날짜가 아닌 입력(연도 다섯 자리)은 예외 대신 검증 오류가 된다', () => {
    expect(() =>
      validateCouponForm(valid({ issueEndAt: '20260-11-30T23:59' }), NOW),
    ).not.toThrow()
    expect(
      validateCouponForm(valid({ issueEndAt: '20260-11-30T23:59' }), NOW)
        .issueEndAt,
    ).toBeDefined()
  })

  it('이름 길이는 코드 포인트로 센다(이모지 50개는 50자)', () => {
    expect(
      validateCouponForm(valid({ name: '🎁'.repeat(50) }), NOW).name,
    ).toBeUndefined()
    expect(
      validateCouponForm(valid({ name: '🎁'.repeat(51) }), NOW).name,
    ).toBeDefined()
  })

  it('이름은 1~50자, 특정 강의면 강의가 필요하다', () => {
    expect(validateCouponForm(valid({ name: '  ' }), NOW).name).toBeDefined()
    expect(
      validateCouponForm(valid({ name: '가'.repeat(51) }), NOW).name,
    ).toBeDefined()
    expect(
      validateCouponForm(valid({ lectureId: '' }), NOW).lectureId,
    ).toBeDefined()
  })
})

describe('요청 본문', () => {
  it('KST 입력을 Instant(UTC)로 바꾸고, 쓰지 않는 필드는 null로 보낸다', () => {
    expect(kstInputToInstant('2026-11-09T10:00')).toBe(
      '2026-11-09T01:00:00.000Z',
    )
    expect(toCouponInput(valid())).toEqual({
      name: '가을맞이 할인',
      targetType: 'LECTURE',
      lectureId: 7,
      discountType: 'RATE',
      discountValue: 10,
      maxDiscountAmount: null,
      quantity: 100,
      issueStartAt: '2026-11-09T01:00:00.000Z',
      issueEndAt: '2026-11-30T14:59:00.000Z',
      expiryType: 'RELATIVE',
      expiryDays: 30,
      fixedExpiresAt: null,
      stackable: false,
    })
    expect(
      toCouponInput(
        valid({
          targetType: 'ANY_LECTURE',
          lectureId: '',
          maxDiscountAmount: '5000',
          expiryType: 'FIXED',
          expiryDays: '',
          fixedExpiresAt: '2026-12-31T23:59',
        }),
      ),
    ).toMatchObject({
      lectureId: null,
      maxDiscountAmount: 5000,
      expiryDays: null,
      fixedExpiresAt: '2026-12-31T14:59:00.000Z',
    })
  })
})
