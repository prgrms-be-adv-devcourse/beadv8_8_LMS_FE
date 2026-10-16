import type { AnyHandler } from 'msw'
import { memberHandlers } from './member'

/**
 * 개발 서버용 MSW 목(VITE_ENABLE_MSW=true일 때만). 모듈별 파일(mocks/{모듈}.ts)을 여기에 모은다.
 * member.ts(관리자 채널 심사)는 BE에 있지만, 로컬 BE에 심사 대기 데이터가 없어도 화면을 확인하려고 둔다.
 */
export const handlers: AnyHandler[] = [...memberHandlers]
