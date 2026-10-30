/**
 * 로그인 모달에 테스트 계정 로그인(POST /members/local-login)을 보여 줄지.
 * pnpm dev와 VITE_LOCAL_LOGIN=true로 직접 빌드한 이미지(로컬 k3d 확인용)에서만 켠다. 운영 이미지는 넘기지 않는다.
 * 테스트에서 vi.stubEnv로 바꿀 수 있게 부를 때마다 읽는다.
 */
export function isLocalLoginEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_LOCAL_LOGIN === 'true'
}
