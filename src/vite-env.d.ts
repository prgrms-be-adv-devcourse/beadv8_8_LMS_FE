/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 토스페이먼츠 테스트 클라이언트 키(test_ck_…). 공개 값이며, 없으면 HP 충전을 끈다. */
  readonly VITE_TOSS_PAYMENTS_CLIENT_KEY?: string
}
