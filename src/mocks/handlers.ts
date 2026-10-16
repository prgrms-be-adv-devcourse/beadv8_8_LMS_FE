import type { AnyHandler } from 'msw'
import { lectureHandlers } from './lecture'
import { memberHandlers } from './member'

/**
 * BE에 아직 없는 API의 목. Swagger 명세를 BE와 먼저 맞춘 뒤 모듈별 파일(mocks/{모듈}.ts)로 만들어 여기에 모은다.
 * BE가 배포되면 해당 핸들러를 지운다.
 * member.ts(관리자 채널 심사)는 BE에 있지만, 로컬 BE에 심사 대기 데이터가 없어도 화면을 확인하려고 둔다.
 */
export const handlers: AnyHandler[] = [...lectureHandlers, ...memberHandlers]
