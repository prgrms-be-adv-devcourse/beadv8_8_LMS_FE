import { useId } from 'react'
import {
  THEME_PREFS,
  resolveTheme,
  useTheme,
  type ThemePref,
} from '@/shared/lib/theme'
import { Icon } from './icons'
import styles from './AppShell.module.css'

/** 화면 테마 아이콘 */
const THEME_ICON = {
  light:
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  dark: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  system:
    'M3.5 5.5A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 16H5a1.5 1.5 0 0 1-1.5-1.5zM9 20h6M12 16v4',
} as const

const THEME_NAME: Record<ThemePref, string> = {
  light: '라이트',
  dark: '다크',
  system: '시스템',
}

/** 프로필 메뉴의 3단 선택. 기본 라디오라 화살표로 옮기고 Space로 고른다. */
export function ThemeRadios() {
  const [pref, setPref] = useTheme()
  const name = useId()
  return (
    <div className={styles.themeRow}>
      <span className={styles.eyebrow} id={`${name}-label`}>
        화면 테마
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        className={styles.segmented}
      >
        {THEME_PREFS.map((value) => (
          <label key={value} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={pref === value}
              onChange={() => setPref(value)}
              className="sr-only"
            />
            <Icon d={THEME_ICON[value]} size={15} />
            {THEME_NAME[value]}
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * 비회원 헤더의 순환 버튼(프로필 메뉴가 없어 여기서 바꾼다). 시스템에서 누르면 지금 보이는 것의 반대로 가서
 * 첫 누름에 늘 화면이 바뀐다: 시스템 → 반대 → 같은 쪽 → 시스템.
 */
export function ThemeCycleButton() {
  const [pref, setPref] = useTheme()
  const next = (): ThemePref => {
    if (pref === 'system')
      return resolveTheme('system') === 'dark' ? 'light' : 'dark'
    const systemSide = resolveTheme('system')
    return pref === systemSide ? 'system' : systemSide
  }
  return (
    <button
      type="button"
      className={styles.iconBtn}
      aria-label={`화면 테마: ${THEME_NAME[pref]}`}
      title={`화면 테마: ${THEME_NAME[pref]}`}
      onClick={() => setPref(next())}
    >
      <Icon d={THEME_ICON[pref]} />
    </button>
  )
}
