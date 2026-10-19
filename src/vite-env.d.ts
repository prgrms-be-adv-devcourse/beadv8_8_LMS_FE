/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 토스페이먼츠 테스트 클라이언트 키(test_ck_…). 공개 값이며, 없으면 HP 충전을 끈다. */
  readonly VITE_TOSS_PAYMENTS_CLIENT_KEY?: string
  /** 'true'면 로그인 모달에 테스트 계정 로그인을 보여 준다. dev 서버 빌드에만 넣는다(운영 X). */
  readonly VITE_LOCAL_LOGIN?: string
}
