import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from '@/app/fallbacks/chunkLoad'
import { queryClient } from '@/app/queryClient'
import { createRoutes, PAGE_LOADERS } from '@/app/router'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { openAccountMenu, stubNarrowScreen } from '@/test/accountMenu'
import { mockOrders } from '@/test/lectureOrders'
import { renderApp } from '@/test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  closeLoginModal()
  sessionStorage.clear()
  queryClient.clear()
})

function Broken(): never {
  throw new Error('화면을 그리다 실패')
}

/** 헤더(로고)와 주요 메뉴(둘러보기)가 남아 있다 */
async function expectShell() {
  expect(
    await screen.findByRole('link', { name: '합방 홈' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('navigation', { name: '둘러보기' }),
  ).toBeInTheDocument()
}

const linkNames = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent)

describe('화면 오류(앱 셸 안)', () => {
  it('화면 하나가 그리다 실패해도 헤더·메뉴는 남고, 메뉴로 다른 화면에 갈 수 있다', async () => {
    // 라우터가 잡은 렌더 오류를 콘솔에 남기는 것은 이 테스트에서 의도한 것이다.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = renderApp(
      '/wallet',
      'USER',
      {},
      { routes: createRoutes({ '/wallet': Broken }) },
    )
    expect(await screen.findByText('문제가 생겼어요')).toBeInTheDocument()
    await expectShell()

    const nav = await openAccountMenu()
    await userEvent.click(within(nav).getByRole('link', { name: '쿠폰함' }))
    expect(
      await screen.findByRole('heading', { name: '쿠폰함' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/library/coupons')
    expect(screen.queryByText('문제가 생겼어요')).not.toBeInTheDocument()
  })

  it('방금 새로고침했는데 또 화면 파일을 못 받으면 앱 셸 안에서 새로고침을 안내한다', async () => {
    sessionStorage.setItem('hapbang:chunk-reloaded-at', String(Date.now()))
    vi.spyOn(PAGE_LOADERS, '/wallet').mockRejectedValue(
      new TypeError(
        'Failed to fetch dynamically imported module: https://hapbang.test/assets/WalletPage-old.js',
      ),
    )
    const reload = vi.spyOn(page, 'reload').mockImplementation(() => {})
    renderApp('/wallet', 'USER', {}, { routes: createRoutes() })
    expect(
      await screen.findByText('화면을 불러오지 못했어요'),
    ).toBeInTheDocument()
    await expectShell()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('브라우저 탭 제목', () => {
  it('가장 안쪽 화면의 제목을 "<제목> · 합방"으로 쓰고, 화면을 옮기면 바꾼다', async () => {
    const router = renderApp('/wallet', 'USER')
    await screen.findByRole('heading', { name: '지갑' })
    expect(document.title).toBe('지갑 · 합방')

    await router.navigate('/library/coupons')
    await waitFor(() => expect(document.title).toBe('쿠폰함 · 합방'))
  })

  it('제목이 없는 화면(없는 주소)은 "합방"이다', async () => {
    renderApp('/no-such-page', 'USER')
    expect(
      await screen.findByText('페이지를 찾을 수 없어요'),
    ).toBeInTheDocument()
    expect(document.title).toBe('합방')
  })
})

describe('비회원·회원 상단 메뉴', () => {
  it.each([
    ['GUEST', ['강의']],
    ['USER', ['강의', '출연 모집', '인플루언서']],
    ['INFLUENCER', ['강의', '출연 모집', '인플루언서']],
    ['VERIFIED_INFLUENCER', ['강의', '출연 모집', '인플루언서']],
  ] as const)(
    '%s는 상단 둘러보기 메뉴를 쓰고 왼쪽 메뉴·햄버거가 없다',
    async (viewer, names) => {
      renderApp('/lectures', viewer)
      const top = await screen.findByRole('navigation', { name: '둘러보기' })
      expect(linkNames(top)).toEqual(names)
      expect(within(top).getByRole('link', { name: '강의' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull()
      expect(screen.queryByRole('button', { name: '메뉴 열기' })).toBeNull()
    },
  )
})

describe('계정 메뉴', () => {
  /** 계정 메뉴의 그룹 이름 → 링크 이름 */
  const groups = (nav: HTMLElement) =>
    Object.fromEntries(
      within(nav)
        .getAllByRole('group')
        .map((g) => [
          document.getElementById(g.getAttribute('aria-labelledby') ?? '')
            ?.textContent,
          linkNames(g),
        ]),
    )

  it.each([
    [
      'USER',
      {
        '내 활동': ['내 강의', '쿠폰함', '쿠폰 받기'],
        '판매·인증': ['채널 인증'],
        지원: ['자주 묻는 질문', '고객센터'],
      },
    ],
    [
      'INFLUENCER',
      {
        '내 활동': ['내 출연', '내 강의', '쿠폰함', '쿠폰 받기', '내 프로필'],
        '판매·인증': ['승급 신청'],
        지원: ['자주 묻는 질문', '고객센터'],
      },
    ],
    [
      'VERIFIED_INFLUENCER',
      {
        '내 활동': ['내 출연', '내 강의', '쿠폰함', '쿠폰 받기', '내 프로필'],
        '판매·인증': ['강의 판매', '쿠폰 신청'],
        지원: ['자주 묻는 질문', '고객센터'],
      },
    ],
  ] as const)(
    '%s 계정 메뉴: 둘러보기 밖의 그룹 → 지갑·계정 설정 → 화면 테마 → 로그아웃',
    async (viewer, expected) => {
      renderApp('/lectures', viewer)
      const nav = await openAccountMenu()
      expect(groups(nav)).toEqual(expected)
      expect(linkNames(nav).slice(-2)).toEqual(['지갑', '계정 설정'])
      // 둘러보기 항목은 상단 메뉴에만 있다.
      expect(within(nav).queryByRole('link', { name: '강의' })).toBeNull()
      const menu = nav.parentElement as HTMLElement
      expect(
        within(menu).getByRole('radiogroup', { name: '화면 테마' }),
      ).toBeInTheDocument()
      expect(
        within(menu).getByRole('button', { name: '로그아웃' }),
      ).toBeInTheDocument()
    },
  )

  it('지금 보고 있는 화면의 메뉴가 켜진다', async () => {
    renderApp('/library/coupons', 'USER')
    const nav = await openAccountMenu()
    expect(within(nav).getByRole('link', { name: '쿠폰함' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: '내 강의' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('메뉴에서 화면을 고르면 그 화면으로 가고 메뉴가 닫힌다', async () => {
    const router = renderApp('/lectures', 'USER')
    const avatar = await screen.findByRole('button', { name: '하늘 메뉴' })
    const nav = await openAccountMenu()
    await userEvent.click(within(nav).getByRole('link', { name: '지갑' }))
    expect(router.state.location.pathname).toBe('/wallet')
    expect(avatar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: '계정 메뉴' })).toBeNull()
  })

  it('Esc로 닫으면 아바타 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const avatar = await screen.findByRole('button', { name: '하늘 메뉴' })
    await user.click(avatar)
    within(screen.getByRole('navigation', { name: '계정 메뉴' }))
      .getByRole('link', { name: '쿠폰함' })
      .focus()
    await user.keyboard('{Escape}')
    expect(avatar).toHaveAttribute('aria-expanded', 'false')
    expect(avatar).toHaveFocus()
  })

  it('포커스가 메뉴 밖으로 나가면 닫힌다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const avatar = await screen.findByRole('button', { name: '하늘 메뉴' })
    await user.click(avatar)
    screen.getByRole('button', { name: '로그아웃' }).focus()
    await user.tab()
    expect(avatar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: '계정 메뉴' })).toBeNull()
  })
})

describe('구역 탭', () => {
  it('내 강의 구역: 내 강의·주문 내역·쿠폰함을 탭으로 오간다', async () => {
    mockOrders()
    const router = renderApp('/library', 'USER')
    const tabs = await screen.findByRole('navigation', {
      name: '내 강의 메뉴',
    })
    expect(linkNames(tabs)).toEqual(['내 강의', '주문 내역', '쿠폰함'])
    expect(within(tabs).getByRole('link', { name: '내 강의' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await userEvent.click(within(tabs).getByRole('link', { name: '주문 내역' }))
    expect(router.state.location.pathname).toBe('/library/orders')
    const next = await screen.findByRole('navigation', { name: '내 강의 메뉴' })
    expect(
      within(next).getByRole('link', { name: '주문 내역' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(next).getByRole('link', { name: '내 강의' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('스튜디오 구역은 인증된 인플루언서에게 강의 판매·쿠폰 신청을 보인다', async () => {
    renderApp('/studio', 'VERIFIED_INFLUENCER')
    const tabs = await screen.findByRole('navigation', {
      name: '스튜디오 메뉴',
    })
    expect(linkNames(tabs)).toEqual(['강의 판매', '쿠폰 신청'])
  })

  it('구역의 하위 화면과 다른 화면에는 구역 탭이 없다', async () => {
    const router = renderApp('/library/7/review', 'USER')
    await screen.findByRole('navigation', { name: '둘러보기' })
    expect(
      screen.queryByRole('navigation', { name: '내 강의 메뉴' }),
    ).toBeNull()
    await router.navigate('/lectures')
    await screen.findByRole('heading', { level: 1, name: '강의' })
    expect(
      screen.queryByRole('navigation', { name: '내 강의 메뉴' }),
    ).toBeNull()
  })
})

describe('좁은 화면 하단 탭바', () => {
  it('넓은 화면에는 하단 탭바가 없다', async () => {
    renderApp('/lectures', 'USER')
    await screen.findByRole('navigation', { name: '둘러보기' })
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull()
  })

  it('비회원: 홈 · 강의 · 로그인(로그인 창을 연다)', async () => {
    stubNarrowScreen()
    renderApp('/lectures', 'GUEST')
    const tabs = await screen.findByRole('navigation', { name: '주요 메뉴' })
    expect(linkNames(tabs)).toEqual(['홈', '강의'])
    expect(within(tabs).getByRole('link', { name: '강의' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent.click(within(tabs).getByRole('button', { name: '로그인' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('회원: 홈 · 둘러보기 항목 · 마이. 마이는 계정 메뉴를 시트로 연다', async () => {
    stubNarrowScreen()
    const router = renderApp('/', 'USER')
    const tabs = await screen.findByRole('navigation', { name: '주요 메뉴' })
    expect(linkNames(tabs)).toEqual(['홈', '강의', '출연 모집', '인플루언서'])
    expect(within(tabs).getByRole('link', { name: '홈' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    const my = within(tabs).getByRole('button', { name: '마이' })
    expect(my).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(my)
    expect(my).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: '내 메뉴' })
    const nav = within(sheet).getByRole('navigation', { name: '계정 메뉴' })
    await userEvent.click(within(nav).getByRole('link', { name: '쿠폰함' }))
    expect(router.state.location.pathname).toBe('/library/coupons')
    expect(screen.queryByRole('dialog', { name: '내 메뉴' })).toBeNull()
  })

  it('화면 아래에 입력 줄이 있는 채팅방에서는 탭바를 숨긴다', async () => {
    stubNarrowScreen()
    const router = renderApp('/chat', 'INFLUENCER')
    expect(
      await screen.findByRole('navigation', { name: '주요 메뉴' }),
    ).toBeInTheDocument()
    await router.navigate('/chat/5')
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: '주요 메뉴' }),
      ).toBeNull(),
    )
  })
})

describe('관리자 셸', () => {
  it('왼쪽 레일(주 메뉴)을 그대로 쓰고 하단 탭바·구역 탭·상단 둘러보기가 없다', async () => {
    stubNarrowScreen()
    renderApp('/admin', 'ADMIN')
    const rail = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(rail).getByRole('group', { name: '운영' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '메뉴 열기' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: '둘러보기' })).toBeNull()
  })

  it('관리자 계정 메뉴에는 계정 설정·테마·로그아웃만 있다', async () => {
    renderApp('/admin', 'ADMIN')
    const nav = await openAccountMenu()
    expect(linkNames(nav)).toEqual(['계정 설정'])
    expect(within(nav).queryByRole('group')).toBeNull()
  })
})
