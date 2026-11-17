import {
  authSession,
  getAccessToken,
  refreshAccessToken,
} from '@/shared/auth/token'
import { ApiError } from './ApiError'
import { API_BASE } from './base'
import type { ProblemDetail } from './types'

export type StreamRequest = {
  /** JSON으로 보낸다 */
  body: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * 응답을 조각으로 읽는 POST(SSE). POST라 EventSource를 쓸 수 없어 fetch로 보내고, 성공하면 본문을 읽지 않은
 * Response를 돌려준다. 실패(2xx가 아님)하면 스트림을 열지 않은 오류 본문(ProblemDetail)으로 ApiError를 던진다.
 * access token은 api()와 같이 Bearer로 붙이고, 401(토큰 만료)·403(역할이 막 바뀜)이면 토큰을 다시 받아 한 번만
 * 다시 보낸다. 그사이 로그인이 바뀌었으면 다시 보내지 않고, refresh token이 거절됐으면 오류에 sessionEnded를 표시한다.
 * signal로 중단하면 fetch의 AbortError(DOMException)가 그대로 나간다.
 */
export async function openStream(
  path: string,
  { body, signal }: StreamRequest,
): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
  }

  const sentWith = getAccessToken()
  const sentIn = authSession()
  let res = await send(sentWith)
  let sessionEnded = false
  if ((res.status === 401 || res.status === 403) && authSession() === sentIn) {
    const latest = getAccessToken()
    const token =
      latest && latest !== sentWith
        ? latest
        : await refreshAccessToken().catch(() => undefined)
    if (token === null) sessionEnded = true
    if (token && authSession() === sentIn) res = await send(token)
  }

  if (res.ok) return res
  const error = new ApiError(
    res.status,
    await readProblem(res),
    res.headers.get('Retry-After'),
  )
  error.sessionEnded = sessionEnded
  throw error
}

async function readProblem(res: Response): Promise<ProblemDetail | null> {
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('json')) return null
  return (await res.json().catch(() => null)) as ProblemDetail | null
}
