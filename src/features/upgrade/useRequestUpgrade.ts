import { useMutation, useQueryClient } from '@tanstack/react-query'
import { memberKeys, requestUpgrade } from '@/entities/member/api'
import { toast } from '@/shared/ui/toastStore'

/** 승급 신청. 성공하면 내 신청 내역을 다시 불러와 심사 중으로 보여 준다. */
export function useRequestUpgrade() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: requestUpgrade,
    onSuccess: () => toast('승급을 신청했어요. 관리자 심사 후 알려 드려요.'),
    onError: (error) => toast(error.message),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: memberKeys.myUpgradeRequests(),
      }),
  })
}
