import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { routes } from '@/app/router'
import { api } from '@/shared/api/client'
import { meQuery } from '@/shared/auth/me'
import { getAccessToken } from '@/shared/auth/token'
import { closeLoginModal, useLoginModalStore } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs, TEST_ACCESS_TOKEN } from '@/test/renderApp'
import { server } from '@/test/server'

const me = {
  id: ME_ID,
  email: 'a@b.c',
  nickname: '하늘',
  role: 'USER',
  status: 'ACTIVE',
  profileImageUrl: null,
}

/** 새로고침처럼 메모리에 토큰도 내 정보도 없는 상태로 앱을 연다 */
function openFresh(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/** 내 정보 응답. 받은 Authorization 헤더를 남긴다 */
function mockMe() {
  const seen: (string | null)[] = []
  server.use(
    http.get('*/api/v1/members/me', ({ request }) => {
      seen.push(request.headers.get('Authorization'))
      return rs(me)
    }),
  )
  return seen
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('앱 시작', () => {
  it('refresh token 쿠키로 access token을 받은 뒤 그 토큰으로 내 정보를 불러 회원으로 연다', async () => {
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        rs({ accessToken: 'boot-token', expiresIn: 900 }),
      ),
    )
    const seen = mockMe()
    openFresh('/lectures')

    const header = await screen.findByRole('banner')
    expect(
      await within(header).findByRole('button', { name: '하늘 메뉴' }),
    ).toBeInTheDocument()
    expect(seen).toEqual(['Bearer boot-token'])
    expect(getAccessToken()).toBe('boot-token')
  })

  it('다시 받지 못하면(refresh 401) 내 정보를 부르지 않고 비회원으로 연다', async () => {
    // 기본 응답: refresh token이 없어 401
    const seen = mockMe()
    openFresh('/lectures')

    const header = await screen.findByRole('banner')
    expect(
      await within(header).findByRole('button', { name: '로그인' }),
    ).toBeInTheDocument()
    expect(seen).toEqual([])
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
  })
})

describe('API 401', () => {
  it('토큰이 만료돼 401이면 다시 받아 그 요청을 다시 보내고 화면은 그대로다', async () => {
    let refreshCalls = 0
    renderApp('/wallet', 'USER', () => new HttpResponse(null, { status: 401 }))
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        refreshCalls++
        return rs({ accessToken: 'renewed', expiresIn: 900 })
      }),
    )
    // renderApp의 지갑 응답은 토큰과 상관없이 401이므로, 새 토큰일 때만 성공하도록 덮어쓴다.
    server.use(
      http.get('*/api/v1/wallets/me', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer renewed'
          ? rs({
              walletId: 1,
              chargeBalanceHp: 5000,
              revenueBalanceHp: 0,
              heldChargeHp: 0,
              heldRevenueHp: 0,
              availableTotalHp: 5000,
              heldTotalHp: 0,
            })
          : new HttpResponse(null, { status: 401 }),
      ),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: '지갑' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(getAccessToken()).toBe('renewed'))
    expect(refreshCalls).toBe(1)
    expect(screen.queryByRole('dialog', { name: '합방 시작하기' })).toBeNull()
  })

  it('토큰을 다시 받았는데도 그 API가 401이면(아직 사용자 인증을 못 하는 앱) 로그인을 유지하고 모달을 띄우지 않는다', async () => {
    let refreshCalls = 0
    // 지갑 앱이 Bearer를 아직 받지 못해 늘 401이다.
    renderApp(
      '/lectures',
      'USER',
      () => new HttpResponse(null, { status: 401 }),
    )
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        refreshCalls++
        return rs({ accessToken: 'renewed', expiresIn: 900 })
      }),
    )

    const header = await screen.findByRole('banner')
    expect(
      await within(header).findByRole('button', { name: '하늘 메뉴' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(refreshCalls).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(screen.queryByRole('dialog', { name: '합방 시작하기' })).toBeNull()
    expect(queryClient.getQueryData(meQuery.queryKey)).not.toBeNull()
    expect(getAccessToken()).toBe('renewed')
  })

  it('다시 받지 못하면 토큰을 버리고 비회원으로 바꿔 로그인 모달을 띄운다', async () => {
    renderApp('/wallet', 'USER', () => new HttpResponse(null, { status: 401 }))
    // refresh token도 만료됐다.
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        HttpResponse.json(
          { status: 401, code: 'INVALID_REFRESH_TOKEN' },
          { status: 401 },
        ),
      ),
    )
    expect(getAccessToken()).toBe(TEST_ACCESS_TOKEN)

    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
  })
})

describe('로그인 실패', () => {
  it('비밀번호 로그인의 401(INVALID_CREDENTIALS)은 전역 처리(비회원 전환·로그인 모달)를 타지 않고 부른 쪽이 받는다', async () => {
    server.use(
      http.post('*/api/v1/members/login', () =>
        HttpResponse.json(
          {
            status: 401,
            code: 'INVALID_CREDENTIALS',
            detail: '이메일 또는 비밀번호가 올바르지 않습니다.',
          },
          { status: 401 },
        ),
      ),
    )
    queryClient.setQueryData(meQuery.queryKey, null)
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () =>
        api('/members/login', {
          method: 'POST',
          body: { email: 'a@b.c', password: 'wrong' },
        }),
    })

    await expect(mutation.execute(undefined)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    expect(useLoginModalStore.getState().open).toBe(false)
  })

  it.each([
    [
      'EMAIL_REGISTERED_WITH_PASSWORD',
      '이미 비밀번호로 가입된 이메일입니다. 이메일과 비밀번호로 로그인해 주세요.',
    ],
    ['DUPLICATE_EMAIL', '이미 가입된 이메일입니다.'],
    ['access_denied', '구글 로그인을 취소했어요.'],
    ['LOGIN_FAILED', '구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'],
  ])(
    '구글 로그인이 실패해(/login?error=%s) 돌아오면 첫 화면으로 보내고 로그인 모달에 이유를 띄운다',
    async (code, message) => {
      const router = renderApp(`/login?error=${code}`, 'GUEST')

      const dialog = await screen.findByRole('dialog', {
        name: '합방 시작하기',
      })
      expect(within(dialog).getByText(message)).toBeInTheDocument()
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
      expect(router.state.location.search).toBe('')
    },
  )

  it('이미 로그인한 상태로 /login에 들어오면 저장한 돌아갈 경로도 쓰지 않고 모달 없이 첫 화면으로 보낸다', async () => {
    sessionStorage.setItem('hapbang.returnTo', '/lectures')
    const router = renderApp('/login?error=access_denied', 'USER')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('dialog', { name: '합방 시작하기' })).toBeNull()
    expect(sessionStorage.getItem('hapbang.returnTo')).toBeNull()
  })
})
