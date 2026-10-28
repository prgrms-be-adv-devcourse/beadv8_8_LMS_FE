/**
 * 로그인 모달에 테스트 계정 로그인(POST /members/local-login)을 보여 줄지.
 * pnpm dev와 dev 서버 빌드(deploy.yml이 dev에만 VITE_LOCAL_LOGIN=true를 넘긴다)에서만 켠다.
 * 테스트에서 vi.stubEnv로 바꿀 수 있게 부를 때마다 읽는다.
 */
export function isLocalLoginEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_LOCAL_LOGIN === 'true'
}
