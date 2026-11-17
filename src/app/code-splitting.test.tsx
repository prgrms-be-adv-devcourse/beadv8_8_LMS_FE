import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { RouteErrorPage } from '@/app/fallbacks/RouteErrorPage'
import { routes } from '@/app/router'
import { renderApp } from '@/test/renderApp'

// 다른 테스트는 모든 화면을 미리 불러 둔 라우트(testRoutes)를 쓴다. 여기서는 운영 라우트를 그대로 쓴다.
describe('화면별로 나눠 불러오기', () => {
  it('화면 파일을 불러와 그린다', async () => {
    renderApp('/wallet', 'USER', {}, { routes })
    expect(
      await screen.findByRole('heading', { name: '지갑' }),
    ).toBeInTheDocument()
  })

  it('화면 안에서 다른 화면으로 가도 그 화면 파일을 불러온다', async () => {
    const router = renderApp('/wallet', 'USER', {}, { routes })
    await screen.findByRole('heading', { name: '지갑' })
    await router.navigate('/library/coupons')
    expect(
      await screen.findByRole('heading', { name: '쿠폰함' }),
    ).toBeInTheDocument()
  })
})

describe('배포 직후 옛 탭', () => {
  it('방금 새로고침했는데 또 화면 파일을 못 받으면 새로고침을 안내한다', async () => {
    // 라우터가 이미 한 번 새로고침했는데 또 실패한 경우다(처음 실패의 새로고침은 chunkLoad.test.ts가 본다).
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet />,
          errorElement: <RouteErrorPage />,
          children: [
            {
              path: 'wallet',
              lazy: () =>
                Promise.reject(
                  new TypeError(
                    'Failed to fetch dynamically imported module: https://hapbang.test/assets/WalletPage-old.js',
                  ),
                ),
            },
          ],
        },
      ],
      { initialEntries: ['/wallet'] },
    )
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByText('화면을 불러오지 못했어요'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
  })
})
