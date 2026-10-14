import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { memberKeys, requestChannelApproval } from '@/entities/member/api'
import { meQuery } from '@/shared/auth/me'
import { toast } from '@/shared/ui/toastStore'

/**
 * 채널 승인 요청. 팔로워 기준을 넘으면 바로 승인되어 유저 → 인플루언서가 되고(BE가 세션 권한도 바꾼다),
 * 아니면 관리자 심사를 기다린다.
 */
export function useRequestApproval() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: requestChannelApproval,
    onSuccess: async (result) => {
      if (result.status === 'APPROVED') {
        // 인플루언서는 채널 인증 화면을 볼 수 없으므로, 홈으로 옮긴 뒤에 역할을 다시 불러온다.
        // 이동이 끝나기 전에 역할이 바뀌면 이 화면의 가드가 '권한 없음'으로 먼저 내보낸다.
        await navigate('/', { replace: true })
        toast('채널이 승인됐어요. 이제 인플루언서예요.')
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
