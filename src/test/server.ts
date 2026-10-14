import { setupServer } from 'msw/node'
import { handlers } from '@/mocks/handlers'

/** 테스트용 MSW 서버. 테스트마다 server.use(...)로 응답을 정한다. */
export const server = setupServer(...handlers)
