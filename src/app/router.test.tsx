import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { routes } from '@/app/router'
import { meQuery, type Me } from '@/shared/auth/me'
import type { Viewer } from '@/shared/auth/role'
import { closeLoginModal } from '@/shared/ui/loginModal'
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
        }
  queryClient.setQueryData(meQuery.queryKey, me)
  server.use(
    http.get('*/api/v1/wallets/me', () =>
      HttpResponse.json({
        statusCode: 200,
        message: '',
        data: { availableTotalHp: 163000 },
      }),
    ),
  )
  const router = createMemoryRouter(routes, { initialEntries: [path] })
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

  it('권한 없는 회원은 역할 첫 화면으로 보낸다', async () => {
    const router = renderAt('/studio', 'USER')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /합방 상대를 찾고/,
      }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
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
})

describe('내비 레일', () => {
  const navLabels = async () => {
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    return within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent)
  }

  it('비회원은 홈·강의만 본다', async () => {
    renderAt('/lectures', 'GUEST')
    // 출연 모집은 BE 목록·상세가 로그인 필수라 회원에게만 보인다.
    expect(await navLabels()).toEqual(['홈', '강의'])
  })

  it('유저는 채널 인증을 보고 출연·강의 판매는 보지 않는다', async () => {
    renderAt('/lectures', 'USER')
    const labels = await navLabels()
    expect(labels).toContain('채널 인증')
    expect(labels).not.toContain('내 출연')
    expect(labels).not.toContain('강의 판매')
  })

  it('관리자는 운영 메뉴를 보고 지갑은 보지 않는다', async () => {
    renderAt('/admin', 'ADMIN')
    const labels = await navLabels()
    expect(labels).toContain('강의 검수')
    expect(labels).not.toContain('지갑')
  })
})

describe('모바일 내비 드로어', () => {
  it('메뉴 버튼으로 열고 닫는다', async () => {
    renderAt('/lectures', 'USER')
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
    const router = renderAt('/lectures', 'USER')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '메뉴 열기' }))

    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    await user.click(within(nav).getByRole('link', { name: '지갑' }))

    expect(router.state.location.pathname).toBe('/wallet')
    expect(
      await screen.findByRole('button', { name: '메뉴 열기' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('Esc로 닫힌다', async () => {
    renderAt('/lectures', 'USER')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '메뉴 열기' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
