import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLocalLoginEnabled } from './localLogin'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('테스트 계정 로그인 노출', () => {
  it('개발 서버(DEV)에서는 켠다', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_LOCAL_LOGIN', '')
    expect(isLocalLoginEnabled()).toBe(true)
  })

  it('DEV가 아니어도 VITE_LOCAL_LOGIN이 true면 켠다', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_LOCAL_LOGIN', 'true')
    expect(isLocalLoginEnabled()).toBe(true)
  })

  it('DEV가 아니고 플래그가 비었거나 true가 아니면 끈다', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_LOCAL_LOGIN', '')
    expect(isLocalLoginEnabled()).toBe(false)
    vi.stubEnv('VITE_LOCAL_LOGIN', '1')
    expect(isLocalLoginEnabled()).toBe(false)
  })
})
