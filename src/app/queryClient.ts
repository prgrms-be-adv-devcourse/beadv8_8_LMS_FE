import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/shared/api/ApiError'
import { meQuery } from '@/shared/auth/me'
import { openLoginModal } from '@/shared/ui/loginModal'
import { toast } from '@/shared/ui/toastStore'

/** 세션이 끊겼으면(401) 비회원으로 바꾸고 로그인 모달을, 권한이 없으면(403) 안내를 띄운다. */
function handleAuthError(error: unknown) {
  if (isApiError(error, 'UNAUTHORIZED')) {
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
