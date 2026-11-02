import { ApiError } from '@/shared/api/ApiError'
import { API_BASE } from '@/shared/api/base'
import type { ProblemDetail, RsData } from '@/shared/api/types'

/**
 * access token(15분)은 이 모듈 메모리에만 둔다. localStorage·sessionStorage에는 두지 않는다(스크립트로 읽힌다).
 * 새로고침하면 사라지므로 앱이 시작할 때 refresh token 쿠키(HttpOnly, BE만 다룬다)로 다시 받는다.
 */
let current: { token: string; expiresAt: number } | null = null
/**
 * 토큰을 넣거나 버린 횟수. 재발급이 시작된 뒤 토큰이 바뀌었으면(로그아웃, 다른 경로로 받은 토큰) 늦게 끝난 재발급
 * 결과로 덮어쓰거나 지우지 않게 비교한다
 */
let version = 0
/**
 * 토큰을 버린 횟수(로그아웃·계정 전환·재발급 실패). 토큰만 새로 받을 때는 그대로라, 요청을 보낸 뒤 이 값이 바뀌었으면
 * 다른 로그인으로 보고 그 요청을 새 토큰으로 다시 보내지 않는다
 */
let session = 0
/** 진행 중인 재발급. 한 탭에서 동시에 필요해도 한 번만 부른다(여러 탭이 동시에 부르는 것은 BE가 잠시 봐준다) */
let refreshing: Promise<string | null> | null = null
/** refresh token 쿠키를 바꾸는 작업(로그인·로그아웃·비밀번호 변경)의 줄. 하나씩 실행한다 */
let authQueue: Promise<unknown> = Promise.resolve()
/** 줄의 마지막 작업. 줄이 빌 때까지 밖에서 부른 재발급은 시작하지 않는다 */
let pausedBy: Promise<unknown> | null = null

export function getAccessToken(): string | null {
  return current?.token ?? null
}

/** 지금 토큰이 만료되기까지 남은 시간(ms). 토큰이 없으면 0 */
export function accessTokenRemainingMs(now = Date.now()): number {
  return current ? current.expiresAt - now : 0
}

export function setAccessToken(token: string, expiresInSeconds: number) {
  current = { token, expiresAt: Date.now() + expiresInSeconds * 1000 }
  version++
  // 토큰의 만료(exp)는 서버 시계, expiresAt은 이 기기 시계 기준이다. 차이가 두 시계의 차이(응답 지연만큼 오차)다.
  const exp = expOf(token)
  clockOffset = exp === null ? 0 : exp * 1000 - current.expiresAt
}

/** 서버 시계 - 이 기기 시계(ms). 토큰을 받기 전이거나 읽지 못하면 0 */
let clockOffset = 0

/** JWT payload의 exp(초). 서명은 확인하지 않는다(시각을 맞추는 데만 쓴다). 읽지 못하면 null */
function expOf(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(base64)) as { exp?: unknown }
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

/**
 * 서버 시계로 본 지금(ms). 서버가 준 절대 시각(채팅 연결 만료 등)과 비교할 때 쓴다. 기기 시계가 어긋나도
 * 서버 시각에 맞춰 예약하게 한다
 */
export function serverNow(): number {
  return Date.now() + clockOffset
}

/** 토큰을 버린다(로그아웃·다른 탭 로그아웃·재발급 실패) */
export function clearAccessToken() {
  current = null
  version++
  session++
}

/** 지금 로그인의 번호. 토큰을 버리면 바뀐다(clearAccessToken) */
export function authSession(): number {
  return session
}

/**
 * refresh token 쿠키를 바꾸는 작업(로그인·로그아웃·비밀번호 변경)을 하나씩, 재발급과 겹치지 않게 실행한다.
 * - 앞선 작업과 진행 중인 재발급이 끝나기를 기다린 뒤 task를 한다
 * - 줄이 빌 때까지 밖에서 부른 재발급은 시작하지 않고, 끝난 뒤의 토큰을 받는다
 * - task 안에서 재발급이 필요하면 넘겨받은 refresh를 쓴다(refreshAccessToken은 줄을 기다려 교착한다).
 *   task 안에서 보내는 API도 재발급 대상이 아니어야 한다(client.ts의 AUTH_PATHS)
 * 늦게 도착한 재발급 응답이 로그아웃으로 지운 쿠키를 되살리거나 다른 계정·폐기된 쿠키로 덮어쓰지 않게 하고,
 * 두 로그인이 겹쳐 내 정보와 토큰의 계정이 달라지지 않게 하려는 것이다.
 */
export function pauseRefreshWhile<T>(
  task: (refresh: () => Promise<string | null>) => Promise<T>,
): Promise<T> {
  const run = authQueue
    .catch(() => undefined)
    .then(async () => {
      await refreshing?.catch(() => null)
      return task(startRefresh)
    })
  authQueue = run
  pausedBy = run
  const clear = () => {
    if (pausedBy === run) pausedBy = null
  }
  run.then(clear, clear)
  return run
}

/**
 * refresh token 쿠키로 새 access token을 받는다(POST /members/auth/refresh). 쿠키는 매번 새 값으로 바뀐다.
 * 받으면 토큰을, 다시 로그인해야 하면(401 INVALID_REFRESH_TOKEN) 토큰을 버리고 null을 돌려준다.
 * 기다리는 사이 토큰이 바뀌었으면 그 결과 대신 지금 토큰을 돌려준다.
 * 그 밖의 실패(BE 응답 없음 등)는 ApiError를 던지고 지금 토큰은 그대로 둔다.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (pausedBy)
    return pausedBy.then(
      () => getAccessToken(),
      () => getAccessToken(),
    )
  return startRefresh()
}

function startRefresh(): Promise<string | null> {
  refreshing ??= requestRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function requestRefresh(): Promise<string | null> {
  const started = version
  const res = await fetch(`${API_BASE}/members/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  const type = res.headers.get('Content-Type') ?? ''
  const json: unknown = type.includes('json')
    ? await res.json().catch(() => null)
    : null
  if (res.status === 401) {
    if (version === started) clearAccessToken()
    return getAccessToken()
  }
  if (!res.ok) throw new ApiError(res.status, json as ProblemDetail | null)
  const { accessToken, expiresIn } = (
    json as RsData<{ accessToken: string; expiresIn: number }>
  ).data
  // 그사이 로그아웃했거나 다른 토큰이 들어왔으면 받은 토큰을 쓰지 않는다.
  if (version !== started) return getAccessToken()
  setAccessToken(accessToken, expiresIn)
  return accessToken
}
