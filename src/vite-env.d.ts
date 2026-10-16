/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 개발 서버에서 MSW 목 응답을 켠다 ('true'일 때만) */
  readonly VITE_ENABLE_MSW?: string
  /** 토스페이먼츠 테스트 클라이언트 키(test_ck_…). 공개 값이며, 없으면 HP 충전을 끈다. */
  readonly VITE_TOSS_PAYMENTS_CLIENT_KEY?: string
}
