import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  appearanceHpTaskKeys,
  retryAppearanceHpTask,
} from '@/entities/appearance-hp-task/api'
import type {
  AppearanceHpTask,
  AppearanceHpTaskStatus,
} from '@/entities/appearance-hp-task/types'
import { isApiError } from '@/shared/api/ApiError'
import { lookup } from '@/shared/lib/statusLabel'
import { toast } from '@/shared/ui/toastStore'

/** 다시 시도한 뒤의 작업 상태별 안내. 다시 실패해도 BE는 200으로 실행 뒤 작업을 준다 */
const RESULT: Record<
  AppearanceHpTaskStatus,
  (task: AppearanceHpTask) => string
> = {
  DONE: (task) => `HP 작업 #${task.id}: 처리됐어요.`,
  DEAD: (task) =>
    `HP 작업 #${task.id}: 지갑이 다시 거절했어요.${task.lastError ? ` ${task.lastError}` : ''}`,
  PENDING: (task) =>
    `HP 작업 #${task.id}: 결과를 아직 몰라요. 자동으로 이어서 확인해요.`,
}

export function retryResultMessage(task: AppearanceHpTask) {
  return (
    lookup(RESULT, task.status)?.(task) ??
    `HP 작업 #${task.id}을 다시 시도했어요. 목록에서 상태를 확인하세요.`
  )
}

function errorMessage(error: Error) {
  if (isApiError(error, 'HP_TASK_NOT_DEAD'))
    return '이미 다시 시도했거나 자동 처리가 멈춘 작업이 아니에요. 최신 목록을 불러왔어요.'
  if (isApiError(error, 'CONCURRENT_UPDATE'))
    return '다른 관리자가 먼저 다시 시도했어요. 최신 목록을 불러왔어요.'
  if (isApiError(error, 'HP_TASK_NOT_FOUND')) return 'HP 작업을 찾을 수 없어요.'
  return error.message
}

/** 이 작업의 다시 시도가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 봐서 다른 메뉴에 다녀와도 다시 보내지 못한다 */
export function useAppearanceHpTaskRetrying(taskId: number) {
  return useIsMutating({ mutationKey: appearanceHpTaskKeys.retry(taskId) }) > 0
}

/**
 * 멈춘 출연 HP 작업 다시 시도. 같은 멱등 키로 보내므로 HP가 두 번 움직이지 않아 확인 창을 두지 않는다.
 * 응답(실행 뒤 작업)의 상태로 결과를 안내하고, 처리하면(실패해도) 출연 HP 작업 조회 전체를 다시 불러온다.
 * 다른 관리자의 다시 시도와 겹쳤을 수 있다(409). 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
export function useRetryAppearanceHpTask(taskId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: appearanceHpTaskKeys.retry(taskId),
    mutationFn: () => retryAppearanceHpTask(taskId),
    onSuccess: (task) => toast(retryResultMessage(task)),
    onError: (error) => {
      if (
        (isApiError(error) && error.sessionEnded) ||
        isApiError(error, 'FORBIDDEN')
      )
        return
      toast(errorMessage(error), { tone: 'error' })
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: appearanceHpTaskKeys.all }),
  })
}
