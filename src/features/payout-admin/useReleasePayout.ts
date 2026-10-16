import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { payoutKeys, releasePayoutQuarantine } from '@/entities/payout/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 다시 시도해도 같은 결과인 오류(이미 해제됨·항목 없음). 모달을 닫아도 된다 */
export function isFinalReleaseError(error: Error) {
  return (
    isApiError(error, 'PAYOUT_NOT_QUARANTINED') ||
    isApiError(error, 'ORDER_ITEM_NOT_FOUND')
  )
}

function errorMessage(error: Error) {
  if (isApiError(error, 'PAYOUT_NOT_QUARANTINED'))
    return '이미 해제됐거나 격리되지 않은 항목이에요. 목록을 새로 불러왔어요.'
  if (isApiError(error, 'ORDER_ITEM_NOT_FOUND'))
    return '주문 항목을 찾을 수 없어요. 목록을 새로 불러왔어요.'
  return error.message
}

/** 격리 해제. 처리하면(실패해도) 목록을 다시 불러온다 */
export function useReleasePayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: payoutKeys.release(),
    mutationFn: (orderItemId: number) => releasePayoutQuarantine(orderItemId),
    onSuccess: () =>
      toast('격리를 해제했어요. 다음 지급 배치(매일 01:00)에서 다시 시도해요.'),
    onError: (error) => toast(errorMessage(error)),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: payoutKeys.all }),
  })
}

/**
 * 격리 해제가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 본다. 요청 중에 다른 메뉴로 갔다 돌아와도
 * 이전 요청이 끝날 때까지 다시 보내지 못한다.
 */
export function useReleasingPayout() {
  return useIsMutating({ mutationKey: payoutKeys.release() }) > 0
}
