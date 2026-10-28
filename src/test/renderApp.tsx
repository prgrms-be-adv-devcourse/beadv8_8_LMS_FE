import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from '@/app/queryClient'
import { routes } from '@/app/router'
import type { Wallet } from '@/entities/wallet/types'
import { meQuery, type Me } from '@/shared/auth/me'
import type { Viewer } from '@/shared/auth/role'
import { server } from './server'

export const ME_ID = 1

export const rs = <T,>(data: T, status = 200) =>
  HttpResponse.json({ statusCode: status, message: '', data }, { status })

type WalletResponder = () => Response | Promise<Response>

/**
 * 앱 전체 라우터로 path를 그린다. 로그인 상태와 지갑 응답을 미리 정한다.
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
