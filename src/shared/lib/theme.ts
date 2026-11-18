import { useSyncExternalStore } from 'react'

/**
 * 화면 테마(라이트/다크/시스템). 선택은 이 브라우저의 localStorage에만 두고 `<html data-theme>`에 반영한다.
 * 시스템이면 속성을 지워 토큰의 `prefers-color-scheme`을 따른다(src/shared/styles/tokens.css).
 * 첫 그리기 전 깜빡임은 index.html `<head>`의 작은 스크립트가 같은 키·값으로 막는다. 키·값을 바꾸면 그쪽도 함께 고친다.
 */
export type ThemePref = 'light' | 'dark' | 'system'

export const THEME_KEY = 'hapbang.theme'
export const THEME_PREFS: ThemePref[] = ['light', 'dark', 'system']

/** 주소창·상태 표시줄 색(`<meta name="theme-color">`). 상단 바 면(--surface)과 맞춘다. */
export const THEME_COLOR = { light: '#ffffff', dark: '#171a20' } as const

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPref(value: unknown): value is ThemePref {
  return THEME_PREFS.includes(value as ThemePref)
}

/** 저장된 선택. 없거나 모르는 값이거나 storage를 쓸 수 없으면(사생활 보호 창 등) 시스템이다. */
export function readTheme(): ThemePref {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return isPref(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

/** 지금 운영체제가 다크 모드인지. matchMedia가 없는 환경(jsdom)은 라이트로 본다. */
export function systemPrefersDark() {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches
}

/** 실제로 보이는 테마 */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return systemPrefersDark() ? 'dark' : 'light'
}

/**
 * 문서에 반영한다. theme-color는 media가 붙은 meta 두 개(index.html)를 두고, 직접 고르면 둘 다 그 색으로,
 * 시스템이면 각자 media에 맞는 색으로 되돌린다.
 */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      const own = meta.media.includes('dark') ? 'dark' : 'light'
      meta.content = THEME_COLOR[pref === 'system' ? own : pref]
    })
}

const listeners = new Set<() => void>()
let current: ThemePref | null = null

function snapshot(): ThemePref {
  current ??= readTheme()
  return current
}

export function setTheme(pref: ThemePref) {
  current = pref
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    // 저장하지 못해도 이 탭에서는 바꿔 보인다.
  }
  applyTheme(pref)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  // 다른 탭에서 바꾸면 이 탭도 따라간다.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return
    current = readTheme()
    applyTheme(current)
    fn()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

/** 지금 선택한 테마와 바꾸는 함수 */
export function useTheme() {
  const pref = useSyncExternalStore(
    subscribe,
    snapshot,
    () => 'system' as const,
  )
  return [pref, setTheme] as const
}

/** 테스트에서 모듈 기억을 지운다 */
export function resetThemeForTest() {
  current = null
}
