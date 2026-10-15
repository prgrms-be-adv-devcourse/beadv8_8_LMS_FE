import { describe, expect, it } from 'vitest'
import { validateRecruitForm, type RecruitFormValues } from './rules'

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
