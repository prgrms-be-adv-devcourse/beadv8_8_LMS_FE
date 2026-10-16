import { describe, expect, it } from 'vitest'
import {
  approveBlockReason,
  isExchangeReviewable,
  rejectionReasonError,
} from './exchangeReview'
import type { ExchangeApplicant } from './types'

const applicant = (patch: Partial<ExchangeApplicant> = {}) => ({
  applicant: {
    nickname: '별빛',
    role: 'INFLUENCER' as const,
    status: 'ACTIVE' as const,
    approvable: true,
    ...patch,
  },
})

describe('isExchangeReviewable', () => {
  it('승인 대기인 신청만 승인·거절할 수 있다', () => {
    expect(isExchangeReviewable('REQUESTED')).toBe(true)
    for (const status of [
      'APPROVED',
      'REJECTED',
      'CANCELED',
      'PROCESSING',
    ] as const)
      expect(isExchangeReviewable(status)).toBe(false)
  })
})

describe('approveBlockReason', () => {
  it('승인할 수 없는 이유를 신청자 상태로 정한다', () => {
    expect(approveBlockReason({ applicant: null })).toBe(
      '신청자 회원 정보가 아직 반영되지 않아 승인할 수 없어요.',
    )
    expect(
      approveBlockReason(applicant({ status: 'SUSPENDED', approvable: false })),
    ).toBe('정상 상태의 인플루언서가 아니라 승인할 수 없어요(정지).')
    expect(
      approveBlockReason(applicant({ status: 'WITHDRAWN', approvable: false })),
    ).toBe('정상 상태의 인플루언서가 아니라 승인할 수 없어요(탈퇴).')
    expect(
      approveBlockReason(applicant({ role: 'USER', approvable: false })),
    ).toBe('정상 상태의 인플루언서가 아니라 승인할 수 없어요(유저).')
    expect(approveBlockReason(applicant())).toBeNull()
  })
})

describe('rejectionReasonError', () => {
  it('거절 사유는 앞뒤 공백을 빼고 1~500자다', () => {
    expect(rejectionReasonError('   ')).toBe('거절 사유를 입력해 주세요.')
    expect(rejectionReasonError('가'.repeat(501))).toBe(
      '거절 사유는 500자까지 입력할 수 있어요.',
    )
    expect(rejectionReasonError(`  ${'가'.repeat(500)}  `)).toBeNull()
    expect(rejectionReasonError('계좌 정보가 달라요')).toBeNull()
  })
})
