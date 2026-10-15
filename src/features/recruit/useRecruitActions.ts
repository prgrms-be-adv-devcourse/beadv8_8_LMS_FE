import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  acceptApplication,
  appearanceKeys,
  applyRecruit,
  closeRecruit,
  rejectApplication,
  updateRecruit,
  withdrawApplication,
} from '@/entities/appearance/api'
import type { RecruitEdit } from '@/entities/appearance/types'
import { walletKeys } from '@/entities/wallet/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/**
 * 모집 처리 실패 안내. 그사이 다른 처리가 먼저 반영된 경우(APPLICATION_NOT_PENDING·CONCURRENT_UPDATE)는
 * BE 문구를 그대로 보여 주고, 끝난 뒤 다시 불러와 바뀐 상태를 보여 준다.
 */
function recruitErrorMessage(error: Error) {
  if (isApiError(error, 'RECRUIT_FULL')) return '정원이 찼어요.'
  if (isApiError(error, 'APPEARANCE_RECRUIT_NOT_OPEN'))
    return '마감된 모집이에요.'
  if (isApiError(error, 'APPEARANCE_RECRUIT_NOT_EDITABLE'))
    return '모집 중이고 마감 전인 모집글만 고칠 수 있어요.'
  if (isApiError(error, 'DUPLICATE_APPLICATION'))
    return '이미 지원한 모집글이에요.'
  return error.message
}

/** 모집글·지원이 바뀌면 목록·상세·지원 목록을 다시 부른다. 보류 HP가 움직였으면 지갑도 다시 부른다. */
function useInvalidateRecruits({ wallet = false } = {}) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: appearanceKeys.all }),
      wallet && queryClient.invalidateQueries({ queryKey: walletKeys.all }),
    ])
}

const onError = (error: Error) => toast(recruitErrorMessage(error))

export function useEditRecruit(recruitId: number) {
  const invalidate = useInvalidateRecruits()
  return useMutation({
    mutationFn: (edit: RecruitEdit) => updateRecruit(recruitId, edit),
    onSuccess: () => toast('모집글을 고쳤어요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useCloseRecruit(recruitId: number) {
  const invalidate = useInvalidateRecruits({ wallet: true })
  return useMutation({
    mutationFn: () => closeRecruit(recruitId),
    onSuccess: () => toast('모집을 마감했어요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useApplyRecruit(recruitId: number) {
  const invalidate = useInvalidateRecruits()
  return useMutation({
    mutationFn: (message: string) => applyRecruit(recruitId, message),
    onSuccess: () => toast('지원했어요. 호스트가 수락하면 출연이 성립해요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useWithdrawApplication(applicationId: number) {
  const invalidate = useInvalidateRecruits()
  return useMutation({
    mutationFn: () => withdrawApplication(applicationId),
    onSuccess: () => toast('지원을 취소했어요.'),
    onError,
    onSettled: invalidate,
  })
}

/** 수락 (호스트). 바로 출연이 성립한다. HP는 움직이지 않고 모집글 보류가 유지된다 */
export function useAcceptApplication(applicationId: number) {
  const invalidate = useInvalidateRecruits()
  return useMutation({
    mutationFn: () => acceptApplication(applicationId),
    onSuccess: () => toast('지원을 수락했어요. 출연이 성립됐어요.'),
    onError,
    onSettled: invalidate,
  })
}

export function useRejectApplication(applicationId: number) {
  const invalidate = useInvalidateRecruits()
  return useMutation({
    mutationFn: () => rejectApplication(applicationId),
    onSuccess: () => toast('지원을 거절했어요.'),
    onError,
    onSettled: invalidate,
  })
}
