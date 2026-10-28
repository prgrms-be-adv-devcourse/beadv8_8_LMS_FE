import { useQueryClient } from '@tanstack/react-query'
import { memberKeys } from '@/entities/member/api'
import { meQuery, type Me } from '@/shared/auth/me'

/** 내 정보를 바꾼 응답으로 me 캐시를 갱신하고, 공개 프로필도 다시 불러오게 한다. */
export function useApplyMe() {
  const queryClient = useQueryClient()
  return (me: Me) => {
    queryClient.setQueryData(meQuery.queryKey, me)
    return queryClient.invalidateQueries({
      queryKey: memberKeys.profile(me.id),
    })
  }
}
