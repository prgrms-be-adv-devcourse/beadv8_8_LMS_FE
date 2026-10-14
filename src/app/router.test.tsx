import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
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
    expect(
      screen.getByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
  })

  it('권한 없는 회원은 역할 첫 화면으로 보낸다', async () => {
    const router = renderAt('/studio', 'USER')
    expect(
      await screen.findByRole('heading', { name: '홈' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('비회원 홈은 강의 목록, 관리자 홈은 운영 대시보드로 보낸다', async () => {
    const guest = renderAt('/', 'GUEST')
    expect(
      await screen.findByRole('heading', { name: '강의' }),
    ).toBeInTheDocument()
    expect(guest.state.location.pathname).toBe('/lectures')
  })

  it('관리자 홈은 운영 대시보드다', async () => {
    const admin = renderAt('/', 'ADMIN')
    expect(
      await screen.findByRole('heading', { name: '대시보드' }),
    ).toBeInTheDocument()
    expect(admin.state.location.pathname).toBe('/admin')
  })

  it('권한이 있으면 화면을 보여 준다', async () => {
    renderAt('/studio/new', 'VERIFIED_INFLUENCER')
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

  it('비회원은 강의·출연 모집만 본다', async () => {
    renderAt('/lectures', 'GUEST')
    expect(await navLabels()).toEqual(['강의', '출연 모집'])
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
