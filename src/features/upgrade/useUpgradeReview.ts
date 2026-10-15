import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  approveUpgrade,
  memberKeys,
  rejectUpgrade,
} from '@/entities/member/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 처리하면(실패해도) 심사 목록을 다시 불러온다. 다른 관리자가 먼저 처리했을 수 있다. */
function useInvalidateReviews() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: [...memberKeys.all, 'upgrade-reviews'],
    })
}

function errorMessage(error: Error) {
  return isApiError(error, 'UPGRADE_REQUEST_REVIEW_NOT_ALLOWED')
    ? '이미 처리된 신청이에요. 목록을 새로 불러왔어요.'
    : error.message
}

export function useApproveUpgrade() {
  const invalidate = useInvalidateReviews()
  return useMutation({
    mutationFn: (requestId: number) => approveUpgrade(requestId),
    onSuccess: () => toast('승급을 승인했어요. 이제 인증된 인플루언서예요.'),
    onError: (error) => toast(errorMessage(error)),
    onSettled: invalidate,
  })
}

export function useRejectUpgrade() {
  const invalidate = useInvalidateReviews()
  return useMutation({
    mutationFn: ({
      requestId,
      reason,
    }: {
      requestId: number
      reason: string
    }) => rejectUpgrade(requestId, reason),
    onSuccess: () => toast('승급 신청을 반려했어요. 사유가 신청자에게 보여요.'),
    onError: (error) => toast(errorMessage(error)),
    onSettled: invalidate,
  })
}
