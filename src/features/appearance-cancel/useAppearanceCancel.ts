import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  acceptAppearanceCancel,
  appearanceKeys,
  cancelRecruit,
  hostCancelAppearance,
  rejectAppearanceCancel,
  requestAppearanceCancel,
} from '@/entities/appearance/api'
import type { HostCancelInput } from '@/entities/appearance/types'
import { walletKeys } from '@/entities/wallet/api'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { toast } from '@/shared/ui/toastStore'

/** 처리 중인 게스트 취소 요청이 있어 확인이 필요하다는 응답. 확인 모달을 띄운 뒤 다시 보낸다 */
export const CONFIRM_REQUIRED = 'CANCEL_REQUEST_CONFIRM_REQUIRED'

export function isConfirmRequired(error: Error) {
  return isApiError(error, CONFIRM_REQUIRED)
}

/** 출연 취소 실패 안내. 모르는 코드는 BE 문구를 그대로 보여 준다 */
export function cancelErrorMessage(error: Error) {
  if (isApiError(error, 'APPEARANCE_SCHEDULE_PASSED'))
    return '방송 예정 일시가 지나 취소할 수 없어요.'
  if (isApiError(error, 'APPEARANCE_NOT_CANCELABLE'))
    return '이미 취소됐거나 끝난 출연이라 취소할 수 없어요.'
  if (isApiError(error, 'CANCEL_REQUEST_LIMIT_EXCEEDED'))
    return '출연 취소 요청은 출연 1건당 2번까지 보낼 수 있어요.'
  if (isApiError(error, 'CANCEL_REQUEST_ALREADY_PENDING'))
    return '이미 처리 중인 취소 요청이 있어요.'
  if (isApiError(error, 'CANCEL_REQUEST_NOT_PENDING'))
    return '처리 중인 취소 요청이 없어요. 화면을 새로 불러왔어요.'
  if (isApiError(error, 'NOT_APPEARANCE_GUEST'))
    return '이 출연의 게스트만 취소를 요청할 수 있어요.'
  if (isApiError(error, 'NOT_APPEARANCE_HOST'))
    return '이 출연의 호스트만 할 수 있어요.'
  if (isApiError(error, 'APPEARANCE_NOT_FOUND')) return '출연을 찾을 수 없어요.'
  if (isApiError(error, 'NOT_RECRUIT_HOST'))
    return '이 모집글의 호스트만 취소할 수 있어요.'
  if (isApiError(error, 'APPEARANCE_RECRUIT_NOT_CANCELABLE'))
    return '모집 중이거나 마감된 모집글만 취소할 수 있어요.'
  return error.message
}

/** 출연·모집이 바뀌면 목록·상세를 다시 부르고, 보류·위약금·반환으로 HP가 움직이니 지갑도 다시 부른다 */
function useInvalidateCancel() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: appearanceKeys.all }),
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
    ])
}

/** 확인이 필요하다는 응답은 화면이 확인 모달로 처리하므로 안내를 띄우지 않는다 */
const onError = (error: Error) => {
  if (!isConfirmRequired(error)) toast(cancelErrorMessage(error))
}

export function useRequestAppearanceCancel(appearanceId: number) {
  const invalidate = useInvalidateCancel()
  return useMutation({
    mutationFn: (reason: string) =>
      requestAppearanceCancel(appearanceId, reason),
    onSuccess: () =>
      toast(
        '호스트에게 출연 취소를 요청했어요. 방송 전까지 답이 없으면 출연이 유지돼요.',
      ),
    onError,
    onSettled: invalidate,
  })
}

export function useAcceptAppearanceCancel(appearanceId: number) {
  const invalidate = useInvalidateCancel()
  return useMutation({
    mutationFn: () => acceptAppearanceCancel(appearanceId),
    onSuccess: () =>
      toast('취소 요청을 수락했어요. 위약금 없이 합의 취소됐어요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useRejectAppearanceCancel(appearanceId: number) {
  const invalidate = useInvalidateCancel()
  return useMutation({
    mutationFn: (reason: string) =>
      rejectAppearanceCancel(appearanceId, reason),
    onSuccess: () => toast('취소 요청을 거절했어요. 출연이 유지돼요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useHostCancelAppearance(appearanceId: number) {
  const invalidate = useInvalidateCancel()
  return useMutation({
    mutationFn: (input: HostCancelInput) =>
      hostCancelAppearance(appearanceId, input),
    onSuccess: (appearance) =>
      toast(
        appearance.penaltyAmount !== null
          ? `출연을 취소했어요. 위약금 ${formatNumber(appearance.penaltyAmount)} HP가 게스트에게 지급돼요.`
          : '출연을 취소했어요.',
      ),
    onError,
    onSettled: invalidate,
  })
}

export function useCancelRecruit(recruitId: number) {
  const invalidate = useInvalidateCancel()
  return useMutation({
    mutationFn: (input: HostCancelInput) => cancelRecruit(recruitId, input),
    onSuccess: () =>
      toast('모집을 취소했어요. 보류된 HP는 위약금을 빼고 돌려받아요.'),
    onError,
    onSettled: invalidate,
  })
}
