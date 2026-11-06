import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookup, statusOf, UNKNOWN_STATUS } from './statusLabel'

const TABLE: Record<string, [tone: string, label: string]> = {
  DONE: ['ok', '완료'],
}

afterEach(() => vi.restoreAllMocks())

describe('statusOf', () => {
  it('표에 있는 값은 그 색과 이름을 준다', () => {
    expect(statusOf(TABLE, 'DONE')).toEqual(['ok', '완료'])
  })

  it('표에 없는 값은 중립 색과 대체 문구를 준다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(statusOf(TABLE, 'BRAND_NEW')).toEqual(['mute', '알 수 없는 상태'])
  })

  it('상속된 키(constructor·toString)는 표에 없는 값으로 본다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(statusOf(TABLE, 'constructor')).toBe(UNKNOWN_STATUS)
    expect(statusOf(TABLE, 'toString')).toBe(UNKNOWN_STATUS)
  })

  it('null·undefined도 대체 표시를 준다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(statusOf(TABLE, null)).toBe(UNKNOWN_STATUS)
    expect(statusOf(TABLE, undefined)).toBe(UNKNOWN_STATUS)
  })
})

describe('lookup', () => {
  it('표에 없으면 undefined를 주어 부르는 곳이 대체 문구나 숨김을 고르게 한다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(lookup({ A: '가' }, 'A')).toBe('가')
    expect(lookup({ A: '가' }, 'B_UNKNOWN')).toBeUndefined()
  })

  it('개발 중에는 모르는 값마다 콘솔 경고를 한 번만 한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    lookup(TABLE, 'WARN_ONCE')
    lookup(TABLE, 'WARN_ONCE')
    lookup(TABLE, 'WARN_OTHER')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0].join(' ')).toContain('WARN_ONCE')
  })
})
