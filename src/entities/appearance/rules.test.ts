import { describe, expect, it } from 'vitest'
import {
  canHostCancel,
  canRequestCancel,
  penaltyOf,
  type RecruitFormValues,
  validateRecruitForm,
} from './rules'
import type { Appearance } from './types'

const NOW = '2026-10-15T12:00'

const valid: RecruitFormValues = {
  title: '주말 게임 합방 게스트 모집',
  hostChannelUrl: 'https://chzzk.naver.com/host',
  scheduledAt: '2026-10-28T21:00',
  expectedMinutes: '60',
  content: '공포 게임 3인 플레이',
  feePerPerson: '20000',
  recruitCount: '2',
  recruitDeadline: '2026-10-25T23:59',
}

describe('validateRecruitForm', () => {
  it('올바른 입력이면 오류가 없다', () => {
    expect(validateRecruitForm(valid, NOW)).toEqual({})
  })

  it('1인 출연료가 2만 HP 미만이면 오류', () => {
    expect(
      validateRecruitForm({ ...valid, feePerPerson: '19999' }, NOW)
        .feePerPerson,
    ).toBe('1인 최저 출연료는 20,000 HP예요.')
  })

  it('모집 인원이 1~10명이 아니면 오류', () => {
    for (const recruitCount of ['0', '11', ''])
      expect(
        validateRecruitForm({ ...valid, recruitCount }, NOW).recruitCount,
      ).toBe('모집 인원은 1~10명이에요.')
  })

  it('마감 일시가 지금 이후이고 방송 예정 일시보다 앞서지 않으면 오류', () => {
    expect(
      validateRecruitForm(
        { ...valid, recruitDeadline: '2026-10-15T11:00' },
        NOW,
      ).recruitDeadline,
    ).toBe('모집 마감 일시는 지금 이후여야 해요.')
    expect(
      validateRecruitForm(
        { ...valid, recruitDeadline: '2026-10-28T21:00' },
        NOW,
      ).recruitDeadline,
    ).toBe('모집 마감 일시는 방송 예정 일시보다 앞서야 해요.')
  })

  it('제목·채널 주소·콘텐츠 설명·예상 출연 시간 형식을 검사한다', () => {
    const errors = validateRecruitForm(
      {
        ...valid,
        title: ' ',
        hostChannelUrl: 'chzzk.naver.com',
        content: '',
        expectedMinutes: '0',
      },
      NOW,
    )
    expect(Object.keys(errors).sort()).toEqual(
      ['content', 'expectedMinutes', 'hostChannelUrl', 'title'].sort(),
    )
  })
})

describe('출연 취소 규칙', () => {
  const now = new Date('2026-10-16T12:00:00+09:00')
  const base = {
    status: 'ESTABLISHED',
    scheduledAt: '2026-10-20T21:00:00',
    cancelRequests: [],
  } as unknown as Appearance

  it('위약금은 출연료의 30%이고 원 단위 미만은 버린다', () => {
    expect(penaltyOf(25000)).toBe(7500)
    expect(penaltyOf(20001)).toBe(6000)
  })

  it('게스트는 성립 상태·방송 전·요청 2번 미만일 때만 취소를 요청할 수 있다', () => {
    expect(canRequestCancel(base, now)).toBe(true)
    expect(canRequestCancel({ ...base, status: 'CANCEL_REQUESTED' }, now)).toBe(
      false,
    )
    expect(
      canRequestCancel({ ...base, scheduledAt: '2026-10-16T11:00:00' }, now),
    ).toBe(false)
    expect(
      canRequestCancel(
        {
          ...base,
          cancelRequests: [{}, {}] as Appearance['cancelRequests'],
        },
        now,
      ),
    ).toBe(false)
  })

  it('호스트는 성립·취소 요청 중이고 방송 전이면 일방 취소할 수 있다', () => {
    expect(canHostCancel(base, now)).toBe(true)
    expect(canHostCancel({ ...base, status: 'CANCEL_REQUESTED' }, now)).toBe(
      true,
    )
    expect(canHostCancel({ ...base, status: 'CANCELED_BY_HOST' }, now)).toBe(
      false,
    )
    expect(
      canHostCancel({ ...base, scheduledAt: '2026-10-16T11:00:00' }, now),
    ).toBe(false)
  })
})
