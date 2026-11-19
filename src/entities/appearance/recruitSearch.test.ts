import { describe, expect, it } from 'vitest'
import { isCalendarDate, parseRecruitSearch } from './recruitSearch'

describe('isCalendarDate', () => {
  it.each(['2026-11-19', '2028-02-29', '2026-12-31', '2026-01-01'])(
    '%s는 있는 날짜다',
    (value) => expect(isCalendarDate(value)).toBe(true),
  )

  it.each([
    '2026-13-01',
    '2026-00-10',
    '2026-01-32',
    '2026-01-00',
    '2026-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-1-01',
    '2026/01/01',
    '20260101',
    '',
  ])('%s는 없는 날짜다', (value) => expect(isCalendarDate(value)).toBe(false))
})

describe('parseRecruitSearch', () => {
  it('달력에 없는 날짜는 예외 없이 그 조건만 버린다', () => {
    const search = parseRecruitSearch(
      new URLSearchParams(
        'scheduledFrom=2026-00-10&scheduledTo=2026-13-01&minFee=1000',
      ),
    )
    expect(search.scheduledFrom).toBeUndefined()
    expect(search.scheduledTo).toBeUndefined()
    expect(search.minFee).toBe(1000)
  })
})
