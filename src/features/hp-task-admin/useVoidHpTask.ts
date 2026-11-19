import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { hpTaskKeys, voidLectureHpTask } from '@/entities/hp-task/api'
import {
  fallbackActionMessage,
  isGlobalAuthError,
  useMountedRef,
} from '@/features/admin-flow/actionError'
import { useListOrigin } from '@/features/admin-flow/listOrigin'
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
  return fallbackActionMessage(error)
}

/** 확인 창 안에 남길 실패 문구. 전역 안내·창을 닫는 오류면 null */
export function voidFailureMessage(error: Error | null) {
  if (!error || isGlobalAuthError(error) || isFinalVoidError(error)) return null
  return errorMessage(error)
}

/**
 * 멈춘 주문 보류의 보류 무효화(되돌릴 수 없음). 성공하면 새로 생긴 무효화 작업 상세로 간다(들어온 목록 주소는 이어 준다).
 * 지갑에 실제로 보내는 일(대기 → 완료·멈춤)은 그 작업에서 확인한다. 원래 보류는 완료 · 무효화로 닫힌다.
 * 확인 창에서 쓴다. 응답 전에 창을 닫았거나 다른 화면으로 갔으면(이 훅을 쓰는 창이 내려감) 끌고 가지 않고 토스트로만 알린다.
 * 실패는 창 안에 남기고(voidFailureMessage), 창을 닫는 오류이거나 창이 내려갔으면 토스트로 알린다.
 * 처리하면(실패해도) 강의 HP 작업 조회 전체를 다시 불러온다. 다른 관리자의 재시도·무효화와 겹쳤을 수 있다.
 * 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
export function useVoidHpTask(taskId: number) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const origin = useListOrigin('/admin/hp-tasks')
  // 훅 수준 콜백은 창이 내려가도 불리므로, 이동과 창 안 오류는 창이 남아 있을 때만 쓴다.
  const mounted = useMountedRef()
  return useMutation({
    mutationKey: hpTaskKeys.void(taskId),
    mutationFn: () => voidLectureHpTask(taskId),
    onSuccess: (voidTask) => {
      toast(
        `보류를 무효화했어요. 무효화 작업 #${voidTask.id}을 다음 재시도 배치(1분마다)가 지갑에 보내요.`,
      )
      if (mounted.current)
        navigate(`/admin/hp-tasks/${voidTask.id}`, { state: origin.state })
    },
    onError: (error) => {
      if (isGlobalAuthError(error)) return
      if (mounted.current && !isFinalVoidError(error)) return
      toast(errorMessage(error))
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: hpTaskKeys.all }),
  })
}
