import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  acceptAppearanceRequest,
  appearanceKeys,
  cancelAppearanceRequest,
  rejectAppearanceRequest,
  updateAppearanceRequest,
} from '@/entities/appearance/api'
import type {
  AppearanceRequest,
  AppearanceRequestEdit,
} from '@/entities/appearance/types'
import { walletKeys } from '@/entities/wallet/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 요청서가 바뀌면 목록·상세를 다시 부르고, 보류 HP가 움직였을 수 있으니 지갑도 다시 부른다. */
function useInvalidateRequests() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: appearanceKeys.all }),
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
    ])
}

/**
 * 수락 (게스트). 확인창을 열 때 저장한 요청서(snapshot)의 버전을 보낸다.
 * 확인창이 열린 동안 상세가 다시 조회돼도, 게스트가 보지 않은 새 버전으로 수락하지 않는다.
 * 그사이 호스트가 고쳤으면 BE가 APPEARANCE_REQUEST_MODIFIED로 막고, 상세를 다시 불러와 바뀐 내용을 보여 준다.
 */
export function useAcceptRequest(snapshot: AppearanceRequest) {
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: () => acceptAppearanceRequest(snapshot.id, snapshot.version),
    onSuccess: () => toast('출연 요청을 수락했어요. 출연이 성립됐어요.'),
    onError: (error) =>
      toast(
        isApiError(error, 'APPEARANCE_REQUEST_MODIFIED')
          ? '호스트가 요청서를 고쳤어요. 바뀐 내용을 확인한 뒤 다시 수락해 주세요.'
          : error.message,
      ),
    onSettled: invalidate,
  })
}

export function useRejectRequest(requestId: number) {
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: (reason: string) => rejectAppearanceRequest(requestId, reason),
    onSuccess: () =>
      toast('출연 요청을 거절했어요. 보류된 HP는 호스트에게 돌아가요.'),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

export function useCancelRequest(requestId: number) {
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: () => cancelAppearanceRequest(requestId),
    onSuccess: () => toast('출연 요청을 취소했어요. 보류한 HP를 돌려받아요.'),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

export function useEditRequest(requestId: number) {
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: (edit: AppearanceRequestEdit) =>
      updateAppearanceRequest(requestId, edit),
    onSuccess: () => toast('요청서를 고쳤어요.'),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}
