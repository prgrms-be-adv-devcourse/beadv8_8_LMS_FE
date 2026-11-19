import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  hpReconciliationKeys,
  runHpReconciliation,
} from '@/entities/hp-reconciliation/api'
import { RECONCILIATION_APPS } from '@/entities/hp-reconciliation/labels'
import type {
  ReconciliationApp,
  ReconciliationRun,
} from '@/entities/hp-reconciliation/types'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/**
 * 응답을 받기 전에 연결이 끊긴 실패: 네트워크 오류, Gateway 응답 시간 초과(504)·연결 끊김(502·503).
 * 서버는 받은 실행을 끝까지 하므로 실패로 끝내지 않고 마지막 결과로 확인한다.
 */
export function isDroppedRunError(error: Error) {
  if (!isApiError(error)) return true
  return error.status === 502 || error.status === 503 || error.status === 504
}

function doneMessage(name: string, run: ReconciliationRun<unknown>) {
  if (run.status === 'INCOMPLETE')
    return `${name} HP 대사를 끝까지 비교하지 못했어요. 실패 이유를 확인하세요. 다음 실행이 같은 범위를 다시 봐요.`
  if (run.status !== 'COMPLETED') return `${name} HP 대사를 실행했어요.`
  return run.mismatchCount > 0
    ? `${name} HP 대사를 마쳤어요. 어긋난 건 ${run.mismatchCount}건을 확인하세요.`
    : `${name} HP 대사를 마쳤어요. 어긋난 건이 없어요.`
}

/**
 * 지금 실행. 끝나면 받은 결과를 마지막 결과로 둔다.
 * 이미 실행 중이면(409) 안내하고, 연결이 끊기면 서버에서 계속 실행 중일 수 있다고 안내한 뒤 마지막 결과를 다시 읽는다.
 * 다시 읽은 결과가 실행 중이면 화면이 끝날 때까지 다시 읽는다. 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
export function useRunHpReconciliation(app: ReconciliationApp) {
  const queryClient = useQueryClient()
  const latestKey = hpReconciliationKeys.latest(app)
  const name = RECONCILIATION_APPS[app].label
  return useMutation({
    mutationKey: hpReconciliationKeys.run(app),
    mutationFn: () => runHpReconciliation(app),
    onSuccess: async (run) => {
      // 실행 중에 다시 읽던 요청이 늦게 와 실행 중 결과로 덮지 않게 먼저 멈춘다.
      await queryClient.cancelQueries({ queryKey: latestKey })
      queryClient.setQueryData(latestKey, run)
      toast(doneMessage(name, run))
    },
    onError: (error) => {
      if (
        (isApiError(error) && error.sessionEnded) ||
        isApiError(error, 'FORBIDDEN')
      )
        return
      if (isApiError(error, 'HP_RECONCILIATION_RUNNING'))
        toast(`${name} HP 대사가 이미 실행 중이에요. 끝나면 결과가 보여요.`)
      else if (isDroppedRunError(error))
        toast(
          '응답을 받지 못했어요. 서버에서 계속 실행 중일 수 있어요. 마지막 결과로 확인하세요.',
        )
      else toast(error.message, { tone: 'error' })
      return queryClient.invalidateQueries({ queryKey: latestKey })
    },
  })
}

/** 이 앱의 지금 실행 요청이 진행 중인지. 화면 상태가 아니라 mutation 캐시로 본다(탭을 바꿨다 와도 막는다) */
export function useHpReconciliationRunBusy(app: ReconciliationApp) {
  return useIsMutating({ mutationKey: hpReconciliationKeys.run(app) }) > 0
}
