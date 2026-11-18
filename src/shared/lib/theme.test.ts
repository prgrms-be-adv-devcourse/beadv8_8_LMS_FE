import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_COLOR,
  THEME_KEY,
  applyTheme,
  readTheme,
  resetThemeForTest,
  resolveTheme,
  setTheme,
  useTheme,
} from './theme'

function addMeta(media: string) {
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.media = media
  document.head.append(meta)
  return meta
}

describe('화면 테마', () => {
  let light: HTMLMetaElement
  let dark: HTMLMetaElement

  beforeEach(() => {
    light = addMeta('(prefers-color-scheme: light)')
    dark = addMeta('(prefers-color-scheme: dark)')
  })
  afterEach(() => {
    light.remove()
    dark.remove()
    localStorage.clear()
    delete document.documentElement.dataset.theme
    resetThemeForTest()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('저장된 값이 없거나 모르는 값이면 시스템이다', () => {
    expect(readTheme()).toBe('system')
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(readTheme()).toBe('system')
    localStorage.setItem(THEME_KEY, 'dark')
    expect(readTheme()).toBe('dark')
  })

  it('storage를 쓸 수 없어도 깨지지 않고 이 탭에서는 바뀐다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readTheme()).toBe('system')
    expect(() => setTheme('dark')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('직접 고르면 html에 넣고 theme-color를 그 색으로 맞춘다', () => {
    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(light.content).toBe(THEME_COLOR.dark)
    expect(dark.content).toBe(THEME_COLOR.dark)
  })

  it('시스템이면 속성과 저장값을 지우고 theme-color를 media별로 되돌린다', () => {
    setTheme('light')
    setTheme('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(light.content).toBe(THEME_COLOR.light)
    expect(dark.content).toBe(THEME_COLOR.dark)
  })

  it('시스템일 때 보이는 테마는 운영체제 설정을 따른다', () => {
    expect(resolveTheme('system')).toBe('light')
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
    }))
    expect(resolveTheme('system')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
  })

  it('useTheme은 바꾼 값을 다시 그리고 다른 탭의 변경을 따라간다', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe('system')
    act(() => result.current[1]('light'))
    expect(result.current[0]).toBe('light')

    act(() => {
      localStorage.setItem(THEME_KEY, 'dark')
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
    })
    expect(result.current[0]).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applyTheme만 불러도 문서에 반영된다', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
