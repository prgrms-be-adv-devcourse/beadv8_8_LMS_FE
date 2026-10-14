import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  formatDate,
  formatDateTime,
  formatDday,
  kstLocalInput,
  toServerDateTime,
} from './date'

// 2026-10-14 23:30 KST
const now = new Date('2026-10-14T14:30:00Z')

describe('date', () => {
  it('시간대 없는 BE 값은 KST로 읽어 보여 준다', () => {
    expect(formatDate('2026-10-20T21:00:00')).toBe('10/20(화)')
    expect(formatDateTime('2026-10-20T21:00:00')).toBe('10/20(화) 21:00')
  })

  it('입력값을 BE LocalDateTime으로 바꾼다', () => {
    expect(toServerDateTime('2026-10-20T21:00')).toBe('2026-10-20T21:00:00')
  })

  it('KST 기준 n일 뒤 입력값을 만든다', () => {
    expect(kstLocalInput(0, undefined, now)).toBe('2026-10-14T23:30')
    expect(kstLocalInput(1, '21:00', now)).toBe('2026-10-15T21:00')
  })

  it('D-day는 KST 날짜로 센다', () => {
    expect(daysUntil('2026-10-15T00:10:00', now)).toBe(1)
    expect(formatDday('2026-10-14T23:59:00', now)).toBe('D-day')
    expect(formatDday('2026-10-17T10:00:00', now)).toBe('D-3')
    expect(formatDday('2026-10-14T20:00:00', now)).toBe('마감')
  })
})
