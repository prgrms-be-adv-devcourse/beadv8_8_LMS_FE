import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from '@/app/queryClient'
import { routes } from '@/app/router'
import type { Wallet } from '@/entities/wallet/types'
import { meQuery, type Me } from '@/shared/auth/me'
import { setAccessToken } from '@/shared/auth/token'
import type { Viewer } from '@/shared/auth/role'
import { server } from './server'

export const ME_ID = 1

/** renderApp이 회원에게 미리 넣는 access token */
export const TEST_ACCESS_TOKEN = 'test-access-token'

export const rs = <T,>(data: T, status = 200) =>
  HttpResponse.json({ statusCode: status, message: '', data }, { status })

type WalletResponder = () => Response | Promise<Response>

/**
 * 앱 전체 라우터로 path를 그린다. 로그인 상태와 지갑 응답을 미리 정한다.
 * 회원이면 access token을 메모리에 넣고, refresh token 쿠키가 있는 것처럼 재발급이 성공하게 한다(TEST_ACCESS_TOKEN을
 * 다시 준다). 재발급 실패를 보려면 테스트에서 덮어쓴다.
 * wallet에 함수를 넘기면 지갑 응답을 직접 만든다(실패·지연 확인용).
 */
export function renderApp(
  path: string,
  viewer: Viewer,
  wallet: Partial<Wallet> | WalletResponder = {},
) {
  const me: Me | null =
    viewer === 'GUEST'
      ? null
      : {
          id: ME_ID,
          email: 'a@b.c',
          nickname: '하늘',
          role: viewer,
          status: 'ACTIVE',
          profileImageUrl: null,
        }
  queryClient.setQueryData(meQuery.queryKey, me)
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
      typeof wallet === 'function'
        ? wallet()
        : rs({
            walletId: 1,
            chargeBalanceHp: 120000,
            revenueBalanceHp: 43000,
            heldChargeHp: 0,
            heldRevenueHp: 0,
            availableTotalHp: 163000,
            heldTotalHp: 0,
            ...wallet,
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
