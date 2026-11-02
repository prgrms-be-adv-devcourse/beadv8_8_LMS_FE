import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/test/server'
import { ApiError } from './ApiError'
import {
  clearAccessToken,
  getAccessToken,
  pauseRefreshWhile,
  refreshAccessToken,
  setAccessToken,
} from '@/shared/auth/token'
import { api } from './client'

const url = (path: string) => `*/api/v1${path}`

describe('api', () => {
  it('RsData로 감싼 응답은 data만 돌려준다', async () => {
    server.use(
      http.get(url('/wallets/me'), () =>
        HttpResponse.json({
          statusCode: 200,
          message: '조회',
          data: { walletId: 1 },
        }),
      ),
    )
    await expect(api('/wallets/me')).resolves.toEqual({ walletId: 1 })
  })

  it('RsData가 아닌 응답은 본문을 그대로 돌려준다', async () => {
    server.use(
      http.get(url('/members/me'), () =>
        HttpResponse.json({ id: 1, role: 'USER' }),
      ),
    )
    await expect(api('/members/me')).resolves.toEqual({ id: 1, role: 'USER' })
  })

  it('204는 undefined를 돌려준다', async () => {
    server.use(
      http.delete(
        url('/lectures/1'),
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    await expect(
      api('/lectures/1', { method: 'DELETE' }),
    ).resolves.toBeUndefined()
  })

  it('ProblemDetail을 ApiError로 바꾼다', async () => {
    server.use(
      http.get(url('/lectures/9'), () =>
        HttpResponse.json(
          { status: 404, detail: '강의가 없어요.', code: 'LECTURE_NOT_FOUND' },
          {
            status: 404,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    const error = await api('/lectures/9').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 404,
      code: 'LECTURE_NOT_FOUND',
      message: '강의가 없어요.',
    })
  })

  it('본문 없는 401은 UNAUTHORIZED 코드로 바꾼다', async () => {
    server.use(
      http.get(
        url('/members/me'),
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    await expect(api('/members/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
  })

  it('요청 값 오류는 errors를 담는다', async () => {
    server.use(
      http.post(url('/lectures'), () =>
        HttpResponse.json(
          {
            status: 400,
            code: 'INVALID_REQUEST',
            errors: [{ field: 'title', message: '필수' }],
          },
          { status: 400 },
        ),
      ),
    )
    await expect(
      api('/lectures', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      errors: [{ field: 'title', message: '필수' }],
    })
  })

  it('오류 본문의 추가 속성(pgCode)을 ApiError에서 읽을 수 있다', async () => {
    server.use(
      http.post(url('/wallets/charges/confirm'), () =>
        HttpResponse.json(
          {
            status: 400,
            code: 'CHARGE_PAYMENT_REJECTED',
            detail: '한도 초과',
            pgCode: 'REJECT_CARD_PAYMENT',
          },
          { status: 400 },
        ),
      ),
    )
    const error = await api('/wallets/charges/confirm', {
      method: 'POST',
      body: {},
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).body?.pgCode).toBe('REJECT_CARD_PAYMENT')
  })

  it('access token이 있으면 Bearer 헤더와 JSON 본문을 붙인다', async () => {
    setAccessToken('abc', 900)
    let seen:
      | { authorization: string | null; type: string | null; body: unknown }
      | undefined
    server.use(
      http.post(url('/lectures/cart/items'), async ({ request }) => {
        seen = {
          authorization: request.headers.get('Authorization'),
          type: request.headers.get('Content-Type'),
          body: await request.json(),
        }
        return HttpResponse.json(
          { statusCode: 201, message: '담음', data: null },
          { status: 201 },
        )
      }),
    )
    await api('/lectures/cart/items', {
      method: 'POST',
      body: { lectureId: 3 },
    })
    expect(seen).toEqual({
      authorization: 'Bearer abc',
      type: 'application/json',
      body: { lectureId: 3 },
    })
  })

  it('토큰이 없으면 Authorization 없이 보내고 query를 붙인다', async () => {
    let seen: { authorization: string | null; search: string } | undefined
    server.use(
      http.get(url('/lectures'), ({ request }) => {
        seen = {
          authorization: request.headers.get('Authorization'),
          search: new URL(request.url).search,
        }
        return HttpResponse.json({ statusCode: 200, message: '', data: [] })
      }),
    )
    await api('/lectures', { query: { page: 0, size: 20, keyword: undefined } })
    expect(seen).toEqual({ authorization: null, search: '?page=0&size=20' })
  })
})

describe('api 토큰 재발급', () => {
  /** 재발급 응답. 부를 때마다 새 토큰(fresh-1, fresh-2 …)을 주고 횟수를 센다 */
  function mockRefresh(respond?: () => Response) {
    const state = { calls: 0 }
    server.use(
      http.post(url('/members/auth/refresh'), () => {
        state.calls++
        return (
          respond?.() ??
          HttpResponse.json({
            statusCode: 200,
            message: '',
            data: { accessToken: `fresh-${state.calls}`, expiresIn: 900 },
          })
        )
      }),
    )
    return state
  }

  /** 받은 Bearer 토큰을 남기고, expired 토큰이면 status로 답한다 */
  function mockWallet(status = 401) {
    const seen: (string | null)[] = []
    server.use(
      http.get(url('/wallets/me'), ({ request }) => {
        const authorization = request.headers.get('Authorization')
        seen.push(authorization)
        if (authorization === 'Bearer expired')
          return new HttpResponse(null, { status })
        return HttpResponse.json({
          statusCode: 200,
          message: '',
          data: { walletId: 1 },
        })
      }),
    )
    return seen
  }

  it('401이면 토큰을 다시 받아 한 번만 다시 보낸다', async () => {
    setAccessToken('expired', 900)
    const refresh = mockRefresh()
    const seen = mockWallet()

    await expect(api('/wallets/me')).resolves.toEqual({ walletId: 1 })
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh-1'])
    expect(refresh.calls).toBe(1)
    expect(getAccessToken()).toBe('fresh-1')
  })

  it('동시에 401이 여러 개 와도 재발급은 한 번만 부른다', async () => {
    setAccessToken('expired', 900)
    const refresh = mockRefresh()
    mockWallet()

    await expect(
      Promise.all([api('/wallets/me'), api('/wallets/me'), api('/wallets/me')]),
    ).resolves.toEqual([{ walletId: 1 }, { walletId: 1 }, { walletId: 1 }])
    expect(refresh.calls).toBe(1)
  })

  it('403(역할이 막 바뀜)도 토큰을 다시 받아 한 번만 다시 보낸다', async () => {
    setAccessToken('expired', 900)
    const refresh = mockRefresh()
    const seen = mockWallet(403)

    await expect(api('/wallets/me')).resolves.toEqual({ walletId: 1 })
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh-1'])
    expect(refresh.calls).toBe(1)
  })

  it('다시 보내도 403이면 그 오류를 던진다(다시 받지 않는다)', async () => {
    setAccessToken('old', 900)
    const refresh = mockRefresh()
    let calls = 0
    server.use(
      http.get(url('/lectures/admin/inspections'), () => {
        calls++
        return new HttpResponse(null, { status: 403 })
      }),
    )

    await expect(api('/lectures/admin/inspections')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
    expect(calls).toBe(2)
    expect(refresh.calls).toBe(1)
  })

  it('다시 받지 못하면(refresh 401) 토큰을 비우고 처음 401을 던진다', async () => {
    setAccessToken('expired', 900)
    // 기본 응답: refresh token이 없어 401
    const seen = mockWallet()

    await expect(api('/wallets/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
    expect(seen).toEqual(['Bearer expired'])
    expect(getAccessToken()).toBeNull()
  })

  it('기다리는 사이 다른 요청이 새 토큰을 받았으면 다시 받지 않고 그 토큰으로 보낸다', async () => {
    setAccessToken('expired', 900)
    const refresh = mockRefresh()
    const seen: (string | null)[] = []
    server.use(
      http.get(url('/wallets/me'), async ({ request }) => {
        const authorization = request.headers.get('Authorization')
        seen.push(authorization)
        if (authorization !== 'Bearer expired')
          return HttpResponse.json({ statusCode: 200, message: '', data: 1 })
        // 응답을 기다리는 사이 다른 탭 요청이 토큰을 바꿨다.
        setAccessToken('other', 900)
        return new HttpResponse(null, { status: 401 })
      }),
    )

    await expect(api('/wallets/me')).resolves.toBe(1)
    expect(seen).toEqual(['Bearer expired', 'Bearer other'])
    expect(refresh.calls).toBe(0)
  })

  it.each([
    ['/members/login', 401, 'INVALID_CREDENTIALS'],
    ['/members/login', 403, 'LOGIN_NOT_ALLOWED'],
    ['/members/signup', 401, 'UNAUTHORIZED'],
    ['/members/login?source=modal', 401, 'INVALID_CREDENTIALS'],
  ])(
    '로그인·가입(%s)의 %d는 토큰 만료가 아니라 결과라 다시 받지 않고 그대로 넘긴다',
    async (path, status, code) => {
      setAccessToken('any', 900)
      const refresh = mockRefresh()
      let calls = 0
      server.use(
        http.post(url(path), () => {
          calls++
          return HttpResponse.json(
            { status, code, detail: '실패' },
            { status, headers: { 'Content-Type': 'application/problem+json' } },
          )
        }),
      )

      await expect(
        api(path, { method: 'POST', body: { email: 'a@b.c', password: 'x' } }),
      ).rejects.toMatchObject({ status, code })
      expect(calls).toBe(1)
      expect(refresh.calls).toBe(0)
      expect(getAccessToken()).toBe('any')
    },
  )

  it('재발급·로그아웃 요청은 401이어도 다시 받지 않는다', async () => {
    setAccessToken('expired', 900)
    const refresh = mockRefresh()
    server.use(
      http.post(
        url('/members/auth/logout'),
        () => new HttpResponse(null, { status: 401 }),
      ),
    )

    await expect(
      api('/members/auth/logout', { method: 'POST' }),
    ).rejects.toMatchObject({ status: 401 })
    expect(refresh.calls).toBe(0)
  })

  it('401 응답을 기다리는 사이 로그인이 바뀌면(로그아웃 뒤 다른 계정) 새 계정 토큰으로 다시 보내지 않는다', async () => {
    setAccessToken('account-a', 900)
    const refresh = mockRefresh()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const seen: (string | null)[] = []
    server.use(
      http.post(url('/lectures/cart/items'), async ({ request }) => {
        seen.push(request.headers.get('Authorization'))
        await gate
        return new HttpResponse(null, { status: 401 })
      }),
    )

    const pending = api('/lectures/cart/items', {
      method: 'POST',
      body: { lectureId: 3 },
    }).catch((e: unknown) => e)
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    // 로그아웃한 뒤 다른 계정으로 로그인했다.
    clearAccessToken()
    setAccessToken('account-b', 900)
    release()

    await expect(pending).resolves.toMatchObject({ status: 401 })
    expect(seen).toEqual(['Bearer account-a'])
    expect(refresh.calls).toBe(0)
  })

  it('로그아웃·계정 전환은 진행 중인 재발급이 끝난 뒤에 하고, 그동안 새 재발급을 시작하지 않는다', async () => {
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let refreshCalls = 0
    server.use(
      http.post(url('/members/auth/refresh'), async () => {
        refreshCalls++
        if (refreshCalls === 1) await gate
        order.push(`refresh ${refreshCalls}`)
        return HttpResponse.json({
          statusCode: 200,
          message: '',
          data: { accessToken: `t${refreshCalls}`, expiresIn: 900 },
        })
      }),
    )

    const first = refreshAccessToken()
    const logout = pauseRefreshWhile(async () => {
      order.push('logout')
      clearAccessToken()
    })
    // 로그아웃을 기다리는 동안 들어온 재발급은 새로 부르지 않고 로그아웃 뒤 상태를 받는다.
    const during = refreshAccessToken()
    release()

    await logout
    await expect(during).resolves.toBeNull()
    await first
    expect(order).toEqual(['refresh 1', 'logout'])
    expect(refreshCalls).toBe(1)
    // 끝난 뒤에는 다시 받을 수 있다(다음 로그인).
    await expect(refreshAccessToken()).resolves.toBe('t2')
  })

  it('재발급을 기다리는 사이 로그아웃하면 늦게 받은 토큰을 쓰지 않는다', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post(url('/members/auth/refresh'), async () => {
        await gate
        return HttpResponse.json({
          statusCode: 200,
          message: '',
          data: { accessToken: 'late', expiresIn: 900 },
        })
      }),
    )

    const pending = refreshAccessToken()
    clearAccessToken()
    release()
    await expect(pending).resolves.toBeNull()
    expect(getAccessToken()).toBeNull()
  })
})
