import { readCookie } from '@/shared/lib/cookie'
import { ApiError } from './ApiError'
import type { ProblemDetail, RsData } from './types'

/** 모든 API는 같은 출처의 상대 경로로 호출한다(docs/deploy.md). */
export const API_BASE = '/api/v1'

const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type Json = Record<string, unknown> | unknown[]

export type ApiRequest = Omit<RequestInit, 'body'> & {
  /** 객체·배열은 JSON으로 보낸다. Blob(File)은 그대로 보낸다(파일 업로드 본문). */
  body?: Json | Blob
  query?: Record<string, string | number | boolean | undefined>
}

/**
 * BE API 호출. 성공하면 RsData의 data만, 204면 undefined를 돌려주고, 실패하면 ApiError를 던진다.
 * 변경 요청에는 XSRF-TOKEN 쿠키 값을 X-XSRF-TOKEN 헤더로 붙인다(BE csrf.spa()).
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

  if (!SAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken()
    if (token) headers.set(CSRF_HEADER, token)
  }

  const res = await fetch(buildUrl(path, query), {
    ...init,
    method,
    headers,
    body: payload,
    credentials: 'same-origin',
  })

  if (res.status === 204) return undefined as T
  const json = await readJson(res)
  if (!res.ok) throw new ApiError(res.status, json as ProblemDetail | null)
  return unwrap<T>(json)
}

function buildUrl(path: string, query: ApiRequest['query']): string {
  const url = `${API_BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
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

/**
 * CSRF 토큰 쿠키가 아직 없으면(첫 방문, 로그아웃 직후) GET 한 번으로 받아 온다.
 * 응답 상태(401 포함)와 상관없이 BE가 쿠키를 내려 준다.
 */
async function ensureCsrfToken(): Promise<string | null> {
  const token = readCookie(CSRF_COOKIE)
  if (token) return token
  await fetch(`${API_BASE}/members/me`, { credentials: 'same-origin' }).catch(
    () => undefined,
  )
  return readCookie(CSRF_COOKIE)
}
