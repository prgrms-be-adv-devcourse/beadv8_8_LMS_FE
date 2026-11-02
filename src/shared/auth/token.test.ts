import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverNow, setAccessToken } from './token'

/** 서명 없는 JWT 모양(payload만 읽는다) */
const jwt = (claims: object) =>
  `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`

afterEach(() => vi.useRealTimers())

describe('serverNow', () => {
  it('토큰 exp(서버 시계)와 받은 시각+expiresIn(기기 시계)의 차이로 서버 시각을 맞춘다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
    // 서버 시계는 기기보다 2분 빠르다: 서버 기준 10:02에 15분짜리 토큰을 발급했다.
    const exp = Date.parse('2026-11-02T10:17:00Z') / 1000
    setAccessToken(jwt({ sub: '1', role: 'USER', exp }), 15 * 60)

    expect(serverNow()).toBe(Date.parse('2026-11-02T10:02:00Z'))
  })

  it('읽을 수 없는 토큰이면 기기 시계를 그대로 쓴다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
    setAccessToken('not-a-jwt', 900)
    expect(serverNow()).toBe(Date.parse('2026-11-02T10:00:00Z'))
  })
})
