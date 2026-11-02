import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/shared/api/ApiError'
import { meQuery } from '@/shared/auth/me'
import { clearAccessToken } from '@/shared/auth/token'
import { openLoginModal } from '@/shared/ui/loginModal'
import { toast } from '@/shared/ui/toastStore'

/**
 * 로그인이 끝났으면(refresh token이 거절됨) 비회원으로 바꾸고 로그인 모달을, 권한이 없으면(403) 안내를 띄운다.
 * 다시 받은 토큰으로도 401인 요청(그 앱이 아직 사용자 인증을 못 하는 등)은 로그인을 유지하고 그 화면의 오류로만 둔다.
 */
function handleAuthError(error: unknown) {
  if (isApiError(error) && error.sessionEnded) {
    clearAccessToken()
    queryClient.setQueryData(meQuery.queryKey, null)
    openLoginModal('로그인이 필요해요.')
  } else if (isApiError(error, 'FORBIDDEN')) {
    toast(error.message)
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
  defaultOptions: {
    queries: {
      // 4xx는 다시 시도해도 같은 결과라 바로 실패시킨다.
      retry: (count, error) =>
        !(isApiError(error) && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})
