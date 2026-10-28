import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  approveChannel,
  memberKeys,
  rejectChannel,
} from '@/entities/member/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 처리하면(실패해도) 심사 목록을 다시 불러온다. 다른 관리자가 먼저 처리했을 수 있다. */
function useInvalidateReviews() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: [...memberKeys.all, 'channel-reviews'],
    })
}

/** 다시 시도해도 같은 결과인 오류(이미 처리됨·채널 없음·회원 비활성). 입력을 지키지 않고 닫아도 된다 */
export function isFinalReviewError(error: Error) {
  return (
    isApiError(error, 'CHANNEL_REVIEW_NOT_ALLOWED') ||
    isApiError(error, 'CHANNEL_NOT_FOUND') ||
    isApiError(error, 'CHANNEL_OWNER_INACTIVE')
  )
}

function errorMessage(error: Error) {
  if (isApiError(error, 'CHANNEL_REVIEW_NOT_ALLOWED'))
    return '이미 처리된 채널이에요. 목록을 새로 불러왔어요.'
  if (isApiError(error, 'CHANNEL_OWNER_INACTIVE'))
    return '탈퇴했거나 이용할 수 없는 회원의 채널이라 처리할 수 없어요.'
  if (isApiError(error, 'CHANNEL_NOT_FOUND'))
    return '채널을 찾을 수 없어요. 목록을 새로 불러왔어요.'
  return error.message
}

export function useApproveChannel() {
  const invalidate = useInvalidateReviews()
  return useMutation({
    mutationKey: memberKeys.channelReview(),
    mutationFn: (channelId: number) => approveChannel(channelId),
    onSuccess: () => toast('채널을 승인했어요. 유저였다면 인플루언서가 돼요.'),
    onError: (error) => toast(errorMessage(error)),
    onSettled: invalidate,
  })
}

export function useRejectChannel() {
  const invalidate = useInvalidateReviews()
  return useMutation({
    mutationKey: memberKeys.channelReview(),
    mutationFn: ({
      channelId,
      reason,
    }: {
      channelId: number
      reason: string
    }) => rejectChannel(channelId, reason),
    onSuccess: () => toast('채널을 반려했어요. 사유가 회원에게 보여요.'),
    onError: (error) => toast(errorMessage(error)),
    onSettled: invalidate,
  })
}

/**
 * 채널 승인·반려가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 본다. 요청 중에 다른 메뉴로 갔다 돌아와도
 * 이전 요청이 끝날 때까지 다시 보내지 못한다(승인·반려 겹침 방지).
 */
export function useReviewingChannel() {
  return useIsMutating({ mutationKey: memberKeys.channelReview() }) > 0
}
