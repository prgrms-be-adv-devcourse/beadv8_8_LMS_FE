import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { getAccessToken, setAccessToken } from '@/shared/auth/token'
import { server } from '@/test/server'
import { uploadBody } from './upload'

const PATH = '/lectures/files/7/content'

/** 업로드 응답. 받은 Authorization 헤더를 남기고, accept 토큰이 아니면 401 */
function mockUpload(accept: string) {
  const seen: (string | null)[] = []
  server.use(
    http.put(`*/api/v1${PATH}`, ({ request }) => {
      const authorization = request.headers.get('Authorization')
      seen.push(authorization)
      return authorization === `Bearer ${accept}`
        ? new HttpResponse(null, { status: 204 })
        : new HttpResponse(null, { status: 401 })
    }),
  )
  return seen
}

const file = () => new Blob(['abc'], { type: 'video/mp4' })

describe('uploadBody', () => {
  it('access token을 Bearer로 붙여 올린다', async () => {
    setAccessToken('abc', 900)
    const seen = mockUpload('abc')
    await uploadBody(PATH, file(), { contentType: 'video/mp4' })
    expect(seen).toEqual(['Bearer abc'])
  })

  it('시작할 때 토큰이 만료돼 401이면 다시 받아 한 번만 다시 올린다', async () => {
    setAccessToken('expired', 900)
    let refreshCalls = 0
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        refreshCalls++
        return HttpResponse.json({
          statusCode: 200,
          message: '',
          data: { accessToken: 'fresh', expiresIn: 900 },
        })
      }),
    )
    const seen = mockUpload('fresh')

    await uploadBody(PATH, file(), { contentType: 'video/mp4' })
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh'])
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBe('fresh')
  })

  it('403(역할이 막 바뀜)도 다시 받아 한 번만 다시 올린다', async () => {
    setAccessToken('old-role', 900)
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        HttpResponse.json({
          statusCode: 200,
          message: '',
          data: { accessToken: 'new-role', expiresIn: 900 },
        }),
      ),
    )
    const seen: (string | null)[] = []
    server.use(
      http.put(`*/api/v1${PATH}`, ({ request }) => {
        const authorization = request.headers.get('Authorization')
        seen.push(authorization)
        return new HttpResponse(null, {
          status: authorization === 'Bearer new-role' ? 204 : 403,
        })
      }),
    )

    await uploadBody(PATH, file(), { contentType: 'video/mp4' })
    expect(seen).toEqual(['Bearer old-role', 'Bearer new-role'])
  })

  it('다시 받지 못하면 처음 401을 던진다', async () => {
    setAccessToken('expired', 900)
    const seen = mockUpload('fresh')
    await expect(
      uploadBody(PATH, file(), { contentType: 'video/mp4' }),
    ).rejects.toMatchObject({ status: 401 })
    expect(seen).toEqual(['Bearer expired'])
  })
})
