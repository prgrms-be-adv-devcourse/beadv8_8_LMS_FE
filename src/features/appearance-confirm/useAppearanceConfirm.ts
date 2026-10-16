import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  appearanceKeys,
  confirmAppearance,
  markAppearanceAbsent,
} from '@/entities/appearance/api'
import { walletKeys } from '@/entities/wallet/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 이미 응답했거나 기간 밖이라 다시 시도해도 소용없는 응답. 화면은 모달을 닫고 새로 불러온 상세를 보여 준다 */
const CLOSED_CODES = [
  'APPEARANCE_NOT_CONFIRMABLE',
  'APPEARANCE_CONFIRM_NOT_OPEN',
  'APPEARANCE_CONFIRM_PERIOD_ENDED',
]

export function isConfirmClosed(error: Error) {
  return CLOSED_CODES.some((code) => isApiError(error, code))
}

/** 출연 확인·불참 실패 안내. 모르는 코드는 BE 문구를 그대로 보여 준다 */
export function confirmErrorMessage(error: Error) {
  if (isApiError(error, 'APPEARANCE_NOT_CONFIRMABLE'))
    return '이미 응답했거나 취소된 출연이라 처리할 수 없어요. 화면을 새로 불러왔어요.'
  if (isApiError(error, 'APPEARANCE_CONFIRM_NOT_OPEN'))
    return '방송 예정 일시가 지난 뒤에 응답할 수 있어요.'
  if (isApiError(error, 'APPEARANCE_CONFIRM_PERIOD_ENDED'))
    return '확인 기간이 지나 곧 자동으로 출연이 확인돼요.'
  if (isApiError(error, 'NOT_APPEARANCE_HOST'))
    return '이 출연의 호스트만 할 수 있어요.'
  if (isApiError(error, 'APPEARANCE_NOT_FOUND')) return '출연을 찾을 수 없어요.'
  return error.message
}

/** 출연 상태가 바뀌고 지급·반환으로 HP가 움직이니 출연 목록·상세와 지갑을 다시 부른다 */
function useInvalidateConfirm() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: appearanceKeys.all }),
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
    ])
}

const onError = (error: Error) => toast(confirmErrorMessage(error))

export function useConfirmAppearance(appearanceId: number) {
  const invalidate = useInvalidateConfirm()
  return useMutation({
    mutationFn: () => confirmAppearance(appearanceId),
    // HP 지급은 BE가 따로 처리해 응답 시점에 끝나지 않았을 수 있다. 진행 상태는 상세에서 보여 준다.
    onSuccess: () => toast('출연을 확인했어요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useMarkAbsent(appearanceId: number) {
  const invalidate = useInvalidateConfirm()
  return useMutation({
    mutationFn: (reason: string) => markAppearanceAbsent(appearanceId, reason),
    onSuccess: () => toast('불참으로 처리했어요.'),
    onError,
    onSettled: invalidate,
  })
}
