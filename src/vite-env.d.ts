/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 토스페이먼츠 테스트 클라이언트 키(test_ck_…). 공개 값이며, 없으면 HP 충전을 끈다. */
  readonly VITE_TOSS_PAYMENTS_CLIENT_KEY?: string
  /** 'true'면 로그인 모달에 테스트 계정 로그인을 보여 준다. 지금은 시연·테스트용 서버 발행 이미지(publish.yml)에도 넣는다. 실제 운영으로 바꿀 때 뺀다. */
  readonly VITE_LOCAL_LOGIN?: string
}
