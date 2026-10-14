import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { ApiError } from './ApiError'
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
    document.cookie = 'XSRF-TOKEN=t'
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
    document.cookie = 'XSRF-TOKEN=t'
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

  it('변경 요청에 CSRF 헤더와 JSON 본문을 붙인다', async () => {
    document.cookie = 'XSRF-TOKEN=abc'
    let seen:
      { token: string | null; type: string | null; body: unknown } | undefined
    server.use(
      http.post(url('/lectures/cart/items'), async ({ request }) => {
        seen = {
          token: request.headers.get('X-XSRF-TOKEN'),
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
      token: 'abc',
      type: 'application/json',
      body: { lectureId: 3 },
    })
  })

  it('CSRF 쿠키가 없으면 GET으로 먼저 받아 온다', async () => {
    let token: string | null = null
    server.use(
      http.get(url('/members/me'), () => {
        document.cookie = 'XSRF-TOKEN=fresh'
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(url('/members/logout'), ({ request }) => {
        token = request.headers.get('X-XSRF-TOKEN')
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await api('/members/logout', { method: 'POST' })
    expect(token).toBe('fresh')
  })

  it('GET에는 CSRF 헤더를 붙이지 않고 query를 붙인다', async () => {
    document.cookie = 'XSRF-TOKEN=abc'
    let seen: { token: string | null; search: string } | undefined
    server.use(
      http.get(url('/lectures'), ({ request }) => {
        seen = {
          token: request.headers.get('X-XSRF-TOKEN'),
          search: new URL(request.url).search,
        }
        return HttpResponse.json({ statusCode: 200, message: '', data: [] })
      }),
    )
    await api('/lectures', { query: { page: 0, size: 20, keyword: undefined } })
    expect(seen).toEqual({ token: null, search: '?page=0&size=20' })
  })
})
