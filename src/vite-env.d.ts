/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 개발 서버에서 MSW 목 응답을 켠다 ('true'일 때만) */
  readonly VITE_ENABLE_MSW?: string
}
