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

/** 내 정보. 로그인하지 않았으면(401) null */
export const meQuery = queryOptions({
  queryKey: ['member', 'me'] as const,
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api<Me>('/members/me')
    } catch (error) {
      if (isApiError(error, 'UNAUTHORIZED')) return null
      throw error
    }
  },
  staleTime: 5 * 60_000,
  // BE가 응답하지 않으면 다시 시도하지 않고 비회원으로 본다(화면이 비어 있지 않게).
  retry: false,
  retryOnMount: false,
})

export function logout() {
  return api<void>('/members/logout', { method: 'POST' })
}

/** 로컬 BE 전용 테스트 계정 로그인 (서버에는 없어 404) */
export function localLogin(role: Role, number = 1) {
  return api<Me>('/members/local-login', {
    method: 'POST',
    query: { role, number },
  })
}
