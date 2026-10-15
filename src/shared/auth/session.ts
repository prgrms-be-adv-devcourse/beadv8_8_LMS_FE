import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { toast } from '@/shared/ui/toastStore'
import { logout, meQuery } from './me'
import type { Viewer } from './role'

const GOOGLE_LOGIN_URL = '/api/v1/members/oauth2/authorization/google'
const RETURN_TO_KEY = 'hapbang.returnTo'

/** 현재 사용자의 역할. 내 정보를 불러오는 중이면 undefined */
export function useViewer(): Viewer | undefined {
  const { data, isPending } = useQuery(meQuery)
  if (isPending) return undefined
  return data?.role ?? 'GUEST'
}

/**
 * 구글 로그인으로 이동한다. BE가 원래 페이지로 돌려보내지 않으므로(requestCache 꺼짐)
 * 돌아올 경로를 저장해 두고 앱 시작 시 consumeReturnTo()로 꺼낸다.
 */
export function startGoogleLogin(
  returnTo = location.pathname + location.search,
) {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, returnTo)
  } catch {
    // 저장소를 못 쓰면 로그인 후 첫 화면으로 간다.
  }
  location.assign(GOOGLE_LOGIN_URL)
}

/** 로그인 전에 저장한 경로를 한 번만 꺼낸다. 같은 출처 경로만 허용한다. */
export function consumeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch {
    return null
  }
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    try {
      await logout()
    } catch {
      toast('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.')
      return
    }
    // 다른 회원의 데이터가 남지 않도록 캐시를 모두 비운다.
    queryClient.clear()
    queryClient.setQueryData(meQuery.queryKey, null)
    navigate('/')
  }
}
