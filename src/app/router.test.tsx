import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { meQuery, type Me } from '@/shared/auth/me'
import type { Viewer } from '@/shared/auth/role'
import { setAccessToken } from '@/shared/auth/token'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { openAccountMenu } from '@/test/accountMenu'
import { rs, TEST_ACCESS_TOKEN, testRoutes } from '@/test/renderApp'
import { server } from '@/test/server'

function renderAt(path: string, viewer: Viewer) {
  const me: Me | null =
    viewer === 'GUEST'
      ? null
      : {
          id: 1,
          email: 'a@b.c',
          nickname: '하늘',
          role: viewer,
          status: 'ACTIVE',
          profileImageUrl: null,
          contentCategories: [],
          bio: null,
        }
  queryClient.setQueryData(meQuery.queryKey, me)
  // renderApp과 같이 회원이면 토큰을 넣고 재발급이 성공하게 한다.
  if (me) {
    setAccessToken(TEST_ACCESS_TOKEN, 15 * 60)
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        rs({ accessToken: TEST_ACCESS_TOKEN, expiresIn: 15 * 60 }),
      ),
    )
  }
  server.use(
    http.get('*/api/v1/wallets/me', () =>
      HttpResponse.json({
        statusCode: 200,
        message: '',
        data: { availableTotalHp: 163000 },
      }),
    ),
  )
  const router = createMemoryRouter(testRoutes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('라우트 가드', () => {
  it('비회원이 회원 화면에 들어오면 로그인 안내를 보여 준다', async () => {
    renderAt('/wallet', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    // 로그인 모달은 LoginRequired의 effect에서 열려서 안내 문구보다 한 번 늦게 그려질 수 있다.
    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
  })

  it('권한 없는 유저는 그 자리에서 지금 역할·필요한 역할과 채널 인증을 안내받는다', async () => {
    const router = renderAt('/studio', 'USER')
    expect(
      await screen.findByText('인증된 인플루언서만 쓸 수 있는 화면이에요'),
    ).toBeInTheDocument()
    expect(screen.getByText(/지금은 유저 계정이에요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '채널 인증하기' })).toHaveAttribute(
      'href',
      '/verify',
    )
    expect(router.state.location.pathname).toBe('/studio')
    expect(screen.queryByText('이 화면을 볼 권한이 없어요.')).toBeNull()
  })

  it('인플루언서가 인증된 인플루언서 화면에 들어오면 승급 신청을 안내받는다', async () => {
    const router = renderAt('/studio', 'INFLUENCER')
    expect(
      await screen.findByText('인증된 인플루언서만 쓸 수 있는 화면이에요'),
    ).toBeInTheDocument()
    expect(screen.getByText(/지금은 인플루언서 계정이에요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '승급 신청하기' })).toHaveAttribute(
      'href',
      '/promote',
    )
    expect(router.state.location.pathname).toBe('/studio')
  })

  it('홈은 비회원도 볼 수 있다', async () => {
    const guest = renderAt('/', 'GUEST')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /합방 상대를 찾고/,
      }),
    ).toBeInTheDocument()
    expect(guest.state.location.pathname).toBe('/')
  })

  it('관리자도 홈을 보고, 운영 화면으로 가는 버튼이 있다', async () => {
    const admin = renderAt('/', 'ADMIN')
    expect(
      await screen.findByRole('link', { name: '운영 화면으로' }),
    ).toHaveAttribute('href', '/admin')
    expect(admin.state.location.pathname).toBe('/')
  })

  it('메뉴에 없는 장바구니도 주소로 들어오면 회원 권한을 따른다', async () => {
    renderAt('/cart', 'USER')
    expect(
      await screen.findByText('장바구니가 비어 있어요'),
    ).toBeInTheDocument()
  })

  it('관리자가 아닌 회원이 /admin에 들어오면 관리자 화면이라고 안내하고 관리 API를 부르지 않는다', async () => {
    const adminRequests: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (/\/api\/v1\/[a-z]+\/admin/.test(request.url))
        adminRequests.push(request.url)
    })
    try {
      const router = renderAt('/admin', 'USER')
      expect(
        await screen.findByText('관리자만 쓸 수 있는 화면이에요'),
      ).toBeInTheDocument()
      expect(
        within(screen.getByRole('main')).getByRole('link', { name: '홈으로' }),
      ).toHaveAttribute('href', '/')
      expect(router.state.location.pathname).toBe('/admin')
      expect(adminRequests).toEqual([])
    } finally {
      server.events.removeAllListeners('request:start')
    }
  })

  it('비회원이 /admin에 들어오면 로그인 안내를 보여 준다', async () => {
    renderAt('/admin', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 1, name: '운영 대시보드' }),
    ).toBeNull()
  })

  it('메뉴에 없는 지갑도 주소로 들어오면 회원 권한을 따른다', async () => {
    const router = renderAt('/wallet', 'USER')
    expect(
      await screen.findByRole('heading', { level: 1, name: '지갑' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/wallet')
  })

  it('관리자가 지갑 주소로 들어오면 운영 첫 화면으로 보낸다', async () => {
    const router = renderAt('/wallet', 'ADMIN')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })

  it.each(['INFLUENCER', 'ADMIN'] as const)(
    '메뉴에 없는 채팅도 %s는 주소로 들어온다',
    async (viewer) => {
      const router = renderAt('/chat', viewer)
      expect(
        await screen.findByRole('heading', { level: 1, name: '채팅' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/chat')
    },
  )

  it.each(['/chat', '/chat/5'])(
    '유저가 %s에 들어오면 인플루언서 화면이라고 안내하고 채널 인증으로 이끈다',
    async (path) => {
      const router = renderAt(path, 'USER')
      expect(
        await screen.findByText('인플루언서부터 쓸 수 있는 화면이에요'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: '채널 인증하기' }),
      ).toHaveAttribute('href', '/verify')
      expect(router.state.location.pathname).toBe(path)
    },
  )

  it('비회원이 채팅 주소로 들어오면 로그인 안내를 보여 준다', async () => {
    renderAt('/chat', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
  })

  it('비회원이 장바구니 주소로 들어오면 로그인 안내를 보여 준다', async () => {
    renderAt('/cart', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
  })

  it('관리자가 장바구니 주소로 들어오면 운영 첫 화면으로 보낸다', async () => {
    const router = renderAt('/cart', 'ADMIN')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })

  it('관리자도 계정 설정 주소로 들어오면 화면을 본다', async () => {
    const router = renderAt('/settings', 'ADMIN')
    expect(
      await screen.findByRole('heading', { level: 1, name: '계정 설정' }),
    ).toBeInTheDocument()
    expect(screen.getByText('a@b.c')).toBeInTheDocument()
    // 회원 등급은 프로필 카드의 필로 보인다(헤더·메뉴의 같은 글자와 구분하려고 본문 안에서 찾는다)
    expect(
      within(screen.getByRole('main')).getByText('관리자', {
        selector: '.pill',
      }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings')
    expect(screen.queryByText('이 화면을 볼 권한이 없어요.')).toBeNull()
  })

  it('관리자가 회원 탈퇴 주소로 들어오면 운영 첫 화면으로 보낸다', async () => {
    const router = renderAt('/settings/withdraw', 'ADMIN')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })

  it('로고를 누르면 홈으로 간다', async () => {
    const router = renderAt('/lectures', 'USER')
    await userEvent.click(await screen.findByRole('link', { name: '합방 홈' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('권한이 있으면 화면을 보여 준다', async () => {
    renderAt('/studio/lectures/new', 'VERIFIED_INFLUENCER')
    expect(
      await screen.findByRole('heading', { name: '강의 등록' }),
    ).toBeInTheDocument()
  })

  it('없는 경로는 404 화면이다', async () => {
    renderAt('/nope', 'USER')
    expect(
      await screen.findByText('페이지를 찾을 수 없어요'),
    ).toBeInTheDocument()
  })

  // BE API가 없어 진입점을 숨긴 화면(#101). 자리표시 대신 404를 보인다.
  it.each([
    ['/search', 'GUEST'],
    ['/search?q=x', 'USER'],
    ['/wallet/account', 'INFLUENCER'],
    ['/admin/disputes', 'ADMIN'],
    ['/admin/disputes/1', 'ADMIN'],
    ['/admin/search', 'ADMIN'],
    ['/admin/logs', 'ADMIN'],
    ['/admin/members/1', 'ADMIN'],
    ['/admin/deals/1', 'ADMIN'],
  ] as const)(
    '없어진 %s 주소로 들어오면(%s) 404 화면이다',
    async (path, viewer) => {
      renderAt(path, viewer)
      expect(
        await screen.findByText('페이지를 찾을 수 없어요'),
      ).toBeInTheDocument()
      expect(screen.queryByText('준비 중인 화면이에요')).toBeNull()
      expect(screen.queryByText('로그인이 필요해요')).toBeNull()
    },
  )
})

describe('역할별 메뉴', () => {
  const linkLabels = (nav: HTMLElement) =>
    within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent)

  /**
   * 그 역할이 메뉴로 갈 수 있는 화면 이름. 관리자는 왼쪽 레일, 비회원·회원은 상단 '둘러보기' + 계정 메뉴(회원만)다.
   */
  const navLabels = async (viewer: Viewer) => {
    if (viewer === 'ADMIN')
      return linkLabels(
        await screen.findByRole('navigation', { name: '주 메뉴' }),
      )
    const top = linkLabels(
      await screen.findByRole('navigation', { name: '둘러보기' }),
    )
    if (viewer === 'GUEST') return top
    return [...top, ...linkLabels(await openAccountMenu())]
  }

  it('비회원은 강의만 본다', async () => {
    renderAt('/lectures', 'GUEST')
    // 홈은 로고로 간다. 출연 모집은 BE 목록·상세가 로그인 필수라 회원에게만 보인다.
    expect(await navLabels('GUEST')).toEqual(['강의'])
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull()
  })

  it('회원 메뉴에는 홈·장바구니·알림이 없다(로고·헤더 아이콘으로 간다)', async () => {
    renderAt('/lectures', 'USER')
    const labels = await navLabels('USER')
    expect(labels).toContain('내 강의')
    expect(labels).not.toContain('홈')
    expect(labels).not.toContain('장바구니')
    expect(labels).not.toContain('알림')
  })

  it('유저는 채널 인증을 보고 출연·강의 판매는 보지 않는다', async () => {
    renderAt('/lectures', 'USER')
    const labels = await navLabels('USER')
    expect(labels).toContain('채널 인증')
    expect(labels).not.toContain('내 출연')
    expect(labels).not.toContain('강의 판매')
  })

  it('관리자는 운영 메뉴를 보고 지갑은 보지 않는다', async () => {
    renderAt('/admin', 'ADMIN')
    const labels = await navLabels('ADMIN')
    expect(labels).toContain('강의 검수')
    expect(labels).not.toContain('지갑')
  })

  it('관리자 운영 메뉴에는 구현된 화면만 있다', async () => {
    renderAt('/admin', 'ADMIN')
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    const ops = within(nav).getByRole('group', { name: '운영' })
    expect(
      within(ops)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      '대시보드',
      '채널 인증 심사',
      '승급 심사',
      '강의 검수',
      '강의 HP 작업',
      '출연 HP 작업',
      'HP 대사',
      '환전 승인',
      '송금 확인',
      '수수료 수입',
      '프로모션 지갑',
      '문의 답변',
      '채팅 기록',
      '쿠폰 운영',
    ])
    // 이의 제기 판단은 문의 답변 상세에서 한다.
    expect(
      within(ops).getByRole('link', { name: '문의 답변' }),
    ).toHaveAttribute('href', '/admin/inquiries')
  })

  // 채팅은 상단 채팅 아이콘으로 들어간다. 지갑은 상단 HP 칸과 계정 메뉴에 있다(관리자는 지갑이 없다).
  it.each(['USER', 'INFLUENCER', 'VERIFIED_INFLUENCER'] as const)(
    '%s 메뉴에는 채팅이 없고 계정 메뉴에 지갑이 있다',
    async (viewer) => {
      renderAt('/lectures', viewer)
      const labels = await navLabels(viewer)
      expect(labels).not.toContain('채팅')
      expect(labels).toContain('지갑')
    },
  )

  it('관리자 레일에는 채팅·지갑이 없다', async () => {
    renderAt('/admin', 'ADMIN')
    const labels = await navLabels('ADMIN')
    expect(labels).not.toContain('채팅')
    expect(labels).not.toContain('지갑')
  })

  it('관리자 레일에는 계정 설정이 없다(계정 메뉴로 들어간다)', async () => {
    renderAt('/admin', 'ADMIN')
    expect(await navLabels('ADMIN')).not.toContain('계정 설정')
  })
})

describe('관리자 모바일 내비 드로어', () => {
  it('메뉴 버튼으로 열고 닫는다', async () => {
    renderAt('/lectures', 'ADMIN')
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: '메뉴 열기' })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await user.click(button)
    expect(screen.getByRole('button', { name: '메뉴 닫기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '메뉴 닫기' }))
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('메뉴에서 화면을 고르면 닫힌다', async () => {
    const router = renderAt('/lectures', 'ADMIN')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '메뉴 열기' }))

    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    await user.click(within(nav).getByRole('link', { name: '대시보드' }))

    expect(router.state.location.pathname).toBe('/admin')
    expect(
      await screen.findByRole('button', { name: '메뉴 열기' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('Esc로 닫힌다', async () => {
    renderAt('/lectures', 'ADMIN')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '메뉴 열기' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('비회원·회원 화면에는 메뉴 버튼(햄버거)이 없다', async () => {
    renderAt('/lectures', 'USER')
    await screen.findByRole('navigation', { name: '둘러보기' })
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).toBeNull()
  })
})
