import { http, HttpResponse } from 'msw'
import { rs } from './renderApp'
import { server } from './server'

/** 메일로 받은 것으로 치는 정답 코드 */
export const EMAIL_CODE = '123456'
/** 코드를 확인하면 주는 인증 토큰 */
export const EMAIL_TOKEN = 'email-verification-token'

type Purpose = 'SIGN_UP' | 'PASSWORD_RESET'

/** ProblemDetail 오류 응답 */
export const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json(
    { status, code, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

/**
 * 인증 코드 받기·확인(BE #557) 흉내. 받기는 늘 같은 200(코드 10분, 다시 받기 60초)이고,
 * 확인은 EMAIL_CODE면 EMAIL_TOKEN을, 아니면 400 INVALID_EMAIL_CODE를 준다. 받은 요청 본문을 차례로 남긴다.
 * 오류 응답은 테스트에서 server.use로 덮어쓴다.
 */
export function mockEmailCodes() {
  const state = {
    sent: [] as { email: string; purpose: Purpose }[],
    verified: [] as { email: string; purpose: Purpose; code: string }[],
  }
  server.use(
    http.post('*/api/v1/members/email-codes', async ({ request }) => {
      state.sent.push((await request.json()) as (typeof state.sent)[number])
      return rs({ expiresInSeconds: 600, resendAfterSeconds: 60 })
    }),
    http.post('*/api/v1/members/email-codes/verify', async ({ request }) => {
      const body = (await request.json()) as (typeof state.verified)[number]
      state.verified.push(body)
      if (body.code !== EMAIL_CODE)
        return problem(400, 'INVALID_EMAIL_CODE', '인증 코드가 맞지 않아요.')
      return rs({ emailVerificationToken: EMAIL_TOKEN, expiresInSeconds: 1800 })
    }),
  )
  return state
}
