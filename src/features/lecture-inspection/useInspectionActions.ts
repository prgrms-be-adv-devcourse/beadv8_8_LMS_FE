import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  approveLecture,
  lectureKeys,
  rejectLecture,
} from '@/entities/lecture/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/**
 * 검수 결과는 검수 목록·관리자 상세뿐 아니라 공개 강의 목록·상세(판매 시작)와
 * 판매자 화면에도 보이므로 강의 쿼리를 모두 다시 부른다.
 */
function useInvalidateLectures() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: lectureKeys.all })
}

/** 다른 관리자가 먼저 처리했으면 BE가 409를 준다. 다시 불러온 상세가 처리 결과를 보여 준다. */
function errorMessage(error: Error) {
  return isApiError(error, 'NOT_PENDING_INSPECTION')
    ? '이미 처리된 강의예요. 최신 상태를 불러왔어요.'
    : error.message
}

/**
 * onDone은 성공하면 무효화보다 먼저 부른다. 호출별 mutate 콜백은 무효화가 끝난 뒤에 불리는데,
 * 그사이 다시 불러온 상세(처리됨)가 버튼을 없애면 불리지 않는다.
 */
type Options = { onDone?: () => void }

export function useApproveLecture(lectureId: number, { onDone }: Options = {}) {
  const invalidate = useInvalidateLectures()
  return useMutation({
    mutationFn: () => approveLecture(lectureId),
    onSuccess: () => {
      toast('승인하고 공개했어요')
      onDone?.()
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: invalidate,
  })
}

export function useRejectLecture(lectureId: number, { onDone }: Options = {}) {
  const invalidate = useInvalidateLectures()
  return useMutation({
    mutationFn: (reason: string) => rejectLecture(lectureId, reason),
    onSuccess: () => {
      toast('반려했어요. 판매자에게 사유를 전달했어요.')
      onDone?.()
    },
    onError: (error) => toast(errorMessage(error)),
    onSettled: invalidate,
  })
}
