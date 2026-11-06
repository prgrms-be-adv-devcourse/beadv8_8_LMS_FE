import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { isApiError } from '@/shared/api/ApiError'
import type { Role } from './role'

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'

/** GET /members/me (BE MemberMeResponse) */
export type Me = {
  id: number
  email: string
  nickname: string
  role: Role
  status: UserStatus
  profileImageUrl: string | null
}

/** 내 정보. 로그인하지 않았으면(refresh token이 없거나 거절됨) null */
export const meQuery = queryOptions({
  queryKey: ['member', 'me'] as const,
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api<Me>('/members/me')
    } catch (error) {
      if (isApiError(error) && error.sessionEnded) return null
      throw error
    }
  },
  staleTime: 5 * 60_000,
  // BE가 응답하지 않으면 다시 시도하지 않고 비회원으로 본다(화면이 비어 있지 않게).
  retry: false,
  retryOnMount: false,
})

/** 이 기기의 refresh token을 폐기하고 쿠키를 지운다(쿠키가 없어도 204) */
export function logout() {
  return api<void>('/members/auth/logout', { method: 'POST' })
}

/**
 * 이메일·비밀번호 로그인. 구글 로그인처럼 refresh token 쿠키만 주므로 access token은 이어서 재발급으로 받는다.
 * 없는 이메일·틀린 비밀번호(구글로 가입한 이메일 포함)는 401 INVALID_CREDENTIALS, 5번 연속 틀리면 15분 동안
 * 429 LOGIN_LOCKED, 정지·탈퇴 회원은 403 LOGIN_NOT_ALLOWED
 */
export function passwordLogin(body: { email: string; password: string }) {
  return api<Me>('/members/login', { method: 'POST', body })
}

/**
 * 이메일·비밀번호 가입. 가입만 하고 로그인은 따로 한다. 인증 코드 확인(SIGN_UP)으로 받은 토큰이 필요하다.
 * 토큰이 없거나 만료(30분)·이미 씀·다른 이메일이면 400 EMAIL_NOT_VERIFIED(코드부터 다시 받는다).
 * 이미 가입된 이메일(구글 포함)이면 409 DUPLICATE_EMAIL, 다른 회원이 쓰는 닉네임이면 409 DUPLICATE_NICKNAME.
 * 가입이 실패하면 토큰은 남아 고쳐서 다시 보낼 수 있다
 */
export function signup(body: {
  email: string
  password: string
  nickname: string
  emailVerificationToken: string
}) {
  return api<Me>('/members/signup', { method: 'POST', body })
}

/**
 * 비밀번호 재설정(로그인 없이). 인증 코드 확인(PASSWORD_RESET)으로 받은 토큰과 새 비밀번호를 보낸다.
 * 성공하면 로그인 잠금이 풀리고 그 회원의 모든 기기가 로그아웃된다(새 비밀번호로 다시 로그인한다).
 * 토큰이 없거나 만료·사용·다른 이메일·가입용이면 400 EMAIL_NOT_VERIFIED(코드부터 다시 받는다).
 * 비밀번호가 없는 회원(구글)은 409 PASSWORD_NOT_SET. 새 비밀번호 규칙 오류(400)면 토큰이 남아 다시 보낼 수 있다
 */
export function resetPassword(body: {
  email: string
  emailVerificationToken: string
  newPassword: string
}) {
  return api<void>('/members/password-reset', { method: 'POST', body })
}

/**
 * 비밀번호 변경. 모든 기기의 refresh token을 폐기하고 이 기기에는 새 쿠키를 준다(다른 기기는 다시 로그인해야 한다).
 * 구글로 가입한 회원은 409 PASSWORD_NOT_SET, 현재 비밀번호가 틀리면 400 INVALID_CURRENT_PASSWORD,
 * 5번 연속 틀리면 15분 동안 429 PASSWORD_CHANGE_LOCKED
 */
export function changePassword(body: {
  currentPassword: string
  newPassword: string
}) {
  return api<void>('/members/me/password', { method: 'PATCH', body })
}
