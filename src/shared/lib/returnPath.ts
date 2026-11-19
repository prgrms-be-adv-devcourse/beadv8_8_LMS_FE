/** FE 라우트가 아닌 BE·문서 경로. 돌아갈 곳으로 받지 않는다. */
const NOT_APP_PATH = /^\/(api|swagger-ui|v3\/api-docs)(\/|$)/

/**
 * 로그인·충전 뒤 돌아갈 경로로 쓸 수 있으면 그 경로(경로·검색어·해시)를, 아니면 null을 돌려준다.
 * 주소로 받은 값이라 같은 출처의 앱 경로만 받는다(//·/\로 시작해 다른 출처로 가는 값, /api 같은 BE 경로는 버린다).
 */
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path?.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(path, window.location.origin)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null
  if (NOT_APP_PATH.test(url.pathname)) return null
  return url.pathname + url.search + url.hash
}

/** 지금 화면의 경로(검색어 포함). 돌아갈 곳으로 넘길 때 쓴다 */
export function currentPath(location: { pathname: string; search: string }) {
  return location.pathname + location.search
}
