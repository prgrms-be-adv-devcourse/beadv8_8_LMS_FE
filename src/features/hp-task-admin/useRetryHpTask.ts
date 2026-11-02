import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { hpTaskKeys, retryLectureHpTask } from '@/entities/hp-task/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 다시 보내도 같은 결과인 오류(이미 멈춘 작업이 아님·작업 없음). 모달을 닫아도 된다 */
export function isFinalRetryError(error: Error) {
  return (
    isApiError(error, 'HP_TASK_NOT_DEAD') ||
    isApiError(error, 'HP_TASK_NOT_FOUND')
  )
}

function errorMessage(error: Error) {
  if (isApiError(error, 'HP_TASK_NOT_DEAD'))
    return '이미 재시도했거나 멈춘 작업이 아니에요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'HP_TASK_NOT_FOUND')) return 'HP 작업을 찾을 수 없어요.'
  return error.message
}

/**
 * 멈춘 작업 재시도. 처리하면(실패해도) 강의 HP 작업 조회 전체를 다시 불러온다.
 * 다른 관리자의 재시도와 겹쳤을 수 있다. 목록·상세·대시보드 건수가 같은 키 아래에 있다.
 * 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
export function useRetryHpTask(taskId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: hpTaskKeys.retry(taskId),
    mutationFn: () => retryLectureHpTask(taskId),
    onSuccess: () =>
      toast(
        '재시도를 요청했어요. 다음 재시도 배치(1분마다)가 같은 요청 ID로 다시 보내요.',
      ),
    onError: (error) => {
      if (isApiError(error, 'UNAUTHORIZED') || isApiError(error, 'FORBIDDEN'))
        return
      toast(errorMessage(error))
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: hpTaskKeys.all }),
  })
}

/**
 * 이 작업의 재시도가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 본다. 모달을 닫았다 열거나
 * 다른 메뉴로 갔다 돌아와도 이전 요청이 끝날 때까지 다시 보내지 못한다.
 */
export function useRetryingHpTask(taskId: number) {
  return useIsMutating({ mutationKey: hpTaskKeys.retry(taskId) }) > 0
}
