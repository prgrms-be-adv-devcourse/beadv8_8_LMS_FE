import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

/**
 * 비회원·회원 셸의 계정 메뉴(아바타 드롭다운)를 열고 그 안의 메뉴 링크 묶음(nav '계정 메뉴')을 돌려준다.
 * 내 활동·판매·인증·지원 메뉴와 지갑·계정 설정이 여기 있다. 둘러보기(강의·출연 모집·인플루언서)는 상단 헤더 nav '둘러보기'다.
 * 관리자는 왼쪽 레일(nav '주 메뉴')을 그대로 쓴다.
 */
export async function openAccountMenu(nickname = '하늘') {
  const avatar = await screen.findByRole('button', { name: `${nickname} 메뉴` })
  if (avatar.getAttribute('aria-expanded') !== 'true')
    await userEvent.click(avatar)
  return screen.getByRole('navigation', { name: '계정 메뉴' })
}

/** 상단 헤더의 주요 메뉴(강의·출연 모집·인플루언서) */
export function browseNav() {
  return screen.findByRole('navigation', { name: '둘러보기' })
}

/**
 * 좁은 화면(≤860px)으로 보이게 한다: 하단 탭바를 그린다. jsdom에는 matchMedia가 없어 기본은 넓은 화면이다.
 * 테스트가 끝나면 vi.unstubAllGlobals()로 되돌린다.
 */
export function stubNarrowScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 860px)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
