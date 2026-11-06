import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { hpTaskKeys, voidLectureHpTask } from '@/entities/hp-task/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 다시 보내도 같은 결과인 오류(이미 멈춘 작업이 아님·주문 보류가 아님·작업 없음). 모달을 닫아도 된다 */
export function isFinalVoidError(error: Error) {
  return (
    isApiError(error, 'HP_TASK_NOT_DEAD') ||
    isApiError(error, 'HP_TASK_NOT_VOIDABLE') ||
    isApiError(error, 'HP_TASK_NOT_FOUND')
  )
}

function errorMessage(error: Error) {
  if (isApiError(error, 'HP_TASK_NOT_DEAD'))
    return '이미 재시도했거나 무효화한 작업이에요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'HP_TASK_NOT_VOIDABLE'))
    return '주문 보류 작업만 무효화할 수 있어요.'
  if (isApiError(error, 'HP_TASK_NOT_FOUND')) return 'HP 작업을 찾을 수 없어요.'
  return error.message
}

/**
 * 멈춘 주문 보류의 보류 무효화(되돌릴 수 없음). 성공하면 새로 생긴 무효화 작업 상세로 간다.
 * 지갑에 실제로 보내는 일(대기 → 완료·멈춤)은 그 작업에서 확인한다. 원래 보류는 완료 · 무효화로 닫힌다.
 * 처리하면(실패해도) 강의 HP 작업 조회 전체를 다시 불러온다. 다른 관리자의 재시도·무효화와 겹쳤을 수 있다.
 * 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
export function useVoidHpTask(taskId: number) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationKey: hpTaskKeys.void(taskId),
    mutationFn: () => voidLectureHpTask(taskId),
    onSuccess: (voidTask) => {
      toast(
        `보류를 무효화했어요. 무효화 작업 #${voidTask.id}을 다음 재시도 배치(1분마다)가 지갑에 보내요.`,
      )
      navigate(`/admin/hp-tasks/${voidTask.id}`)
    },
    onError: (error) => {
      if (
        (isApiError(error) && error.sessionEnded) ||
        isApiError(error, 'FORBIDDEN')
      )
        return
      toast(errorMessage(error))
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: hpTaskKeys.all }),
  })
}
