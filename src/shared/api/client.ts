import {
  authSession,
  getAccessToken,
  refreshAccessToken,
} from '@/shared/auth/token'
import { ApiError } from './ApiError'
import { API_BASE } from './base'
import type { ProblemDetail, RsData } from './types'

export { API_BASE }

/**
 * 재발급 뒤 다시 보내지 않는 요청. 재발급·로그아웃은 refresh token 쿠키로 부르고, 로그인·가입·탈퇴 회원 복구의 401·403은
 * 토큰 만료가 아니라 결과(비밀번호 틀림 INVALID_CREDENTIALS, 이용할 수 없는 회원 LOGIN_NOT_ALLOWED, 복구 티켓 만료
 * INVALID_RESTORE_TICKET)이므로 부른 쪽에 그대로 넘긴다. 비회원이 부르는 복구를 재발급하면 그것도 거절돼 로그인이 끝난
 * 오류(sessionEnded)가 되고, 전역 처리가 '로그인이 필요해요.' 모달로 복구 안내를 덮는다.
 * 비밀번호 변경은 재발급을 멈춘 줄(pauseRefreshWhile) 안에서 바로 앞에 받은 토큰으로 보낸다(여기서 재발급을 기다리면 교착한다)
 */
const AUTH_PATHS = new Set([
  '/members/auth/refresh',
  '/members/auth/logout',
  '/members/login',
  '/members/signup',
  '/members/restore',
  '/members/me/password',
])

type Json = Record<string, unknown> | unknown[]

export type ApiRequest = Omit<RequestInit, 'body'> & {
  /** 객체·배열은 JSON으로 보낸다. Blob(File)은 그대로 보낸다(파일 업로드 본문). */
  body?: Json | Blob
  /** 배열 값은 같은 이름을 값마다 반복해 보낸다(`status=A&status=B`) */
  query?: Record<
    string,
    string | number | boolean | readonly (string | number)[] | undefined
  >
}

/**
 * BE API 호출. 성공하면 RsData의 data만, 204면 undefined를 돌려주고, 실패하면 ApiError를 던진다.
 * access token이 있으면 Authorization: Bearer로 보낸다.
 * 401(토큰 만료)·403(역할이 막 바뀌어 토큰의 역할이 옛 값)이면 토큰을 다시 받아 한 번만 다시 보낸다.
 * 다시 받지 못하거나 그사이 로그인이 바뀌었으면(로그아웃·다른 계정) 처음 실패를 그대로 던진다. 이전 로그인의 요청을
 * 새 계정 토큰으로 보내지 않게 한다.
 * refresh token이 거절돼 다시 받지 못했으면 오류에 sessionEnded를 표시한다(전역 처리가 비회원으로 바꾼다). 다시 받은
 * 토큰으로도 401·403이면 그 요청만의 오류로 던진다(로그인은 유지한다).
 */
export async function api<T>(
  path: string,
  { body, query, ...init }: ApiRequest = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  let payload: BodyInit | undefined
  if (body instanceof Blob) {
    payload = body
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    payload = JSON.stringify(body)
  }

  const send = (token: string | null) => {
    if (token) headers.set('Authorization', `Bearer ${token}`)
    else headers.delete('Authorization')
    return fetch(buildUrl(path, query), {
      ...init,
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
    })
  }

  const sentWith = getAccessToken()
  const sentIn = authSession()
  let res = await send(sentWith)
  let sessionEnded = false
  if (
    (res.status === 401 || res.status === 403) &&
    // 경로에 쿼리를 직접 붙여 불러도 같은 요청으로 본다.
    !AUTH_PATHS.has(path.split('?')[0]) &&
    authSession() === sentIn
  ) {
    // 기다리는 사이 다른 요청이 이미 새 토큰을 받았으면 그 토큰으로 다시 보낸다.
    const latest = getAccessToken()
    // null: refresh token이 거절됐다(로그인이 끝났다). undefined: BE가 응답하지 않아 확인하지 못했다.
    const token =
      latest && latest !== sentWith
        ? latest
        : await refreshAccessToken().catch(() => undefined)
    if (token === null) sessionEnded = true
    if (token && authSession() === sentIn) res = await send(token)
  }

  if (res.status === 204) return undefined as T
  const json = await readJson(res)
  if (!res.ok) {
    const error = new ApiError(res.status, json as ProblemDetail | null)
    error.sessionEnded = sessionEnded
    throw error
  }
  return unwrap<T>(json)
}

function buildUrl(path: string, query: ApiRequest['query']): string {
  const url = `${API_BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
    } else if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function readJson(res: Response): Promise<unknown> {
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('json')) return null
  return res.json().catch(() => null)
}

/**
 * RsData로 감싼 응답만 data를 꺼낸다.
 * 회원·출연 모듈 등 아직 RsData로 바꾸지 않은 API는 본문을 그대로 쓴다(BE 전환이 끝나면 분기를 지운다).
 */
function unwrap<T>(json: unknown): T {
  if (isRsData(json)) return json.data as T
  return json as T
}

function isRsData(json: unknown): json is RsData<unknown> {
  return (
    typeof json === 'object' &&
    json !== null &&
    typeof (json as RsData<unknown>).statusCode === 'number' &&
    typeof (json as RsData<unknown>).message === 'string' &&
    'data' in json
  )
}
