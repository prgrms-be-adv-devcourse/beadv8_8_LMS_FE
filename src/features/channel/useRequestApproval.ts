import { useMutation, useQueryClient } from '@tanstack/react-query'
import { memberKeys, requestChannelApproval } from '@/entities/member/api'
import { meQuery } from '@/shared/auth/me'
import { toast } from '@/shared/ui/toastStore'

/**
 * 채널 승인 요청. 팔로워 기준을 넘으면 바로 승인되어 유저 → 인플루언서가 되고(BE가 세션 권한도 바꾼다),
 * 아니면 관리자 심사를 기다린다.
 */
export function useRequestApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: requestChannelApproval,
    onSuccess: async (result) => {
      if (result.status === 'APPROVED') {
        toast('채널이 승인됐어요. 이제 인플루언서예요.')
        // 역할이 바뀌었으니 메뉴·권한을 다시 그린다. 채널 인증 화면은 그 자리에서 완료 안내로 바뀐다.
        await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      } else {
        toast('채널 승인을 요청했어요. 관리자 심사 후 알려 드려요.')
      }
    },
    onError: (error) => toast(error.message),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: memberKeys.myChannels() }),
  })
}
