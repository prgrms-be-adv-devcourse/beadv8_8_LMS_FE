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
import {
  fallbackActionMessage,
  isGlobalAuthError,
  useMountedRef,
} from '@/features/admin-flow/actionError'
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

/** 다시 보내도 같은 결과인 오류(이미 다시 시도됨·동시 처리·없음). 목록을 다시 불러오므로 확인 창을 닫는다 */
export function isFinalAppearanceRetryError(error: Error) {
  return (
    isApiError(error, 'HP_TASK_NOT_DEAD') ||
    isApiError(error, 'CONCURRENT_UPDATE') ||
    isApiError(error, 'HP_TASK_NOT_FOUND')
  )
}

/**
 * 확인 창 안에 남길 실패 문구. 지갑이 다시 거절한 결과(200, DEAD)도 실패로 남긴다.
 * 전역 안내·창을 닫는 오류면 null
 */
export function appearanceRetryFailureMessage(
  task: AppearanceHpTask | undefined,
  error: Error | null,
) {
  if (task?.status === 'DEAD') return retryResultMessage(task)
  if (!error || isGlobalAuthError(error) || isFinalAppearanceRetryError(error))
    return null
  return errorMessage(error)
}

function errorMessage(error: Error) {
  if (isApiError(error, 'HP_TASK_NOT_DEAD'))
    return '이미 다시 시도했거나 자동 처리가 멈춘 작업이 아니에요. 최신 목록을 불러왔어요.'
  if (isApiError(error, 'CONCURRENT_UPDATE'))
    return '다른 관리자가 먼저 다시 시도했어요. 최신 목록을 불러왔어요.'
  if (isApiError(error, 'HP_TASK_NOT_FOUND')) return 'HP 작업을 찾을 수 없어요.'
  return fallbackActionMessage(error)
}

/** 이 작업의 다시 시도가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 봐서 다른 메뉴에 다녀와도 다시 보내지 못한다 */
export function useAppearanceHpTaskRetrying(taskId: number) {
  return useIsMutating({ mutationKey: appearanceHpTaskKeys.retry(taskId) }) > 0
}

/**
 * 멈춘 출연 HP 작업 다시 시도. 같은 멱등 키로 바로 한 번 보내 HP가 움직이므로 강의 HP 작업처럼 확인 창을 거친다.
 * 응답(실행 뒤 작업)의 상태로 결과를 안내하고, 처리하면(실패해도) 출연 HP 작업 조회 전체를 다시 불러온다.
 * 지갑이 다시 거절했거나(DEAD) 요청이 실패하면 확인 창 안에 남기고(appearanceRetryFailureMessage),
 * 창을 닫는 오류이거나 응답 전에 창을 닫았으면 토스트로 알린다.
 * 다른 관리자의 다시 시도와 겹쳤을 수 있다(409). 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
export function useRetryAppearanceHpTask(taskId: number) {
  const queryClient = useQueryClient()
  const mounted = useMountedRef()
  return useMutation({
    mutationKey: appearanceHpTaskKeys.retry(taskId),
    mutationFn: () => retryAppearanceHpTask(taskId),
    onSuccess: (task) => {
      if (task.status === 'DEAD' && mounted.current) return
      toast(retryResultMessage(task))
    },
    onError: (error) => {
      if (isGlobalAuthError(error)) return
      if (mounted.current && !isFinalAppearanceRetryError(error)) return
      toast(errorMessage(error), { tone: 'error' })
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: appearanceHpTaskKeys.all }),
  })
}
