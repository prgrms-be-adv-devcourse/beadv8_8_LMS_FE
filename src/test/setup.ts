import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetLectureDb } from '@/mocks/lecture'
import { server } from './server'

// CI처럼 느린 환경에서도 화면 전환·재조회를 기다릴 수 있게 findBy·waitFor 대기를 늘린다(기본 1초).
configure({ asyncUtilTimeout: 5000 })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetLectureDb()
  cleanup()
  document.cookie.split('; ').forEach((c) => {
    document.cookie = `${c.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  })
})
afterAll(() => server.close())
