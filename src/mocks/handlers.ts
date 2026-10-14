import type { AnyHandler } from 'msw'

/**
 * BE에 아직 없는 API의 목. Swagger 명세를 BE와 먼저 맞춘 뒤 모듈별 파일(mocks/{모듈}.ts)로 만들어 여기에 모은다.
 * BE가 배포되면 해당 핸들러를 지운다.
 */
export const handlers: AnyHandler[] = []
