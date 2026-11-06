import { api } from '@/shared/api/client'

/** 인증 코드의 용도. 코드와 인증 토큰은 용도마다 따로다(가입 토큰으로 비밀번호를 재설정할 수 없다) */
export type EmailCodePurpose = 'SIGN_UP' | 'PASSWORD_RESET'

/** 코드를 보냈다는 응답. 코드 유효 시간과 다시 받을 수 있을 때까지의 시간(초) */
export type EmailCodeSent = {
  expiresInSeconds: number
  resendAfterSeconds: number
}

/** 코드가 맞았다는 응답. 토큰은 그 용도로 한 번만 쓴다 */
export type EmailVerified = {
  emailVerificationToken: string
  expiresInSeconds: number
}

/**
 * 인증 코드 받기(로그인 없이). 가입 여부를 알려 주지 않으려고 상황과 상관없이 같은 200을 주고 메일 내용만 다르다
 * (이미 가입된 이메일·구글 회원에게는 안내 메일, 없는 이메일에는 보내지 않음). 같은 이메일은 1분에 한 번
 * (429 EMAIL_CODE_RESEND_TOO_SOON), 한 IP 1시간 10통(429 EMAIL_CODE_TOO_MANY_REQUESTS), 한 이메일 하루 5통
 * (429 EMAIL_CODE_DAILY_LIMIT)까지 받는다. 메일을 보낼 수 없으면 503 EMAIL_SEND_UNAVAILABLE
 */
export function sendEmailCode(body: {
  email: string
  purpose: EmailCodePurpose
}) {
  return api<EmailCodeSent>('/members/email-codes', { method: 'POST', body })
}

/**
 * 인증 코드 확인(로그인 없이). 받을 때와 같은 용도로 확인한다. 틀리면 400 INVALID_EMAIL_CODE, 5번째로 틀리거나
 * 코드가 없거나 10분이 지났으면 400 EMAIL_CODE_EXPIRED(다시 받아야 한다). 한 IP 1시간 30번을 넘으면 429
 * EMAIL_CODE_TOO_MANY_REQUESTS
 */
export function verifyEmailCode(body: {
  email: string
  purpose: EmailCodePurpose
  code: string
}) {
  return api<EmailVerified>('/members/email-codes/verify', {
    method: 'POST',
    body,
  })
}
