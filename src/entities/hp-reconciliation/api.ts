import { queryOptions } from '@tanstack/react-query'
import { isApiError } from '@/shared/api/ApiError'
import { api } from '@/shared/api/client'
import type {
  AppearanceReconciliationRun,
  LectureReconciliationRun,
  ReconciliationApp,
} from './types'

/** 앱별 실행 결과 모양 */
export type ReconciliationRunOf = {
  lecture: LectureReconciliationRun
  appearance: AppearanceReconciliationRun
}

const BASE: Record<ReconciliationApp, string> = {
  lecture: '/lectures/admin/hp-reconciliations',
  appearance: '/appearances/admin/hp-reconciliations',
}

export const hpReconciliationKeys = {
  all: ['hp-reconciliation'] as const,
  latest: (app: ReconciliationApp) =>
    [...hpReconciliationKeys.all, app, 'latest'] as const,
  /** 지금 실행 mutation. 다른 메뉴로 갔다 와도 진행 중인 요청을 알 수 있게 앱마다 고정한다 */
  run: (app: ReconciliationApp) =>
    [...hpReconciliationKeys.all, app, 'run'] as const,
}

/** 실행 중(RUNNING)이거나 지금 실행 요청이 끝나지 않았으면 이 간격으로 마지막 결과를 다시 읽는다 */
export const RECONCILIATION_POLL_MS = 5_000

/**
 * 마지막으로 시작한 실행과 어긋난 건. 실행 중이면 그때까지의 상태(RUNNING, 어긋난 건 없음)다.
 * 실행 기록이 없으면(404 HP_RECONCILIATION_NOT_FOUND) 오류가 아니라 null이다.
 */
export const latestHpReconciliationQuery = <A extends ReconciliationApp>(
  app: A,
) =>
  queryOptions({
    queryKey: hpReconciliationKeys.latest(app),
    queryFn: async (): Promise<ReconciliationRunOf[A] | null> => {
      try {
        return await api<ReconciliationRunOf[A]>(`${BASE[app]}/latest`)
      } catch (error) {
        if (isApiError(error, 'HP_RECONCILIATION_NOT_FOUND')) return null
        throw error
      }
    },
  })

/**
 * 지금 대사를 실행하고 끝날 때까지 기다려 결과를 받는다. 비교만 하고 HP는 옮기지 않는다.
 * 지갑 조회가 실패해도 오류가 아니라 200 + INCOMPLETE + failureReason이다. 이미 실행 중이면(매일 배치 포함)
 * 409 HP_RECONCILIATION_RUNNING. 응답 전에 연결이 끊겨도 서버는 끝까지 실행하므로 마지막 결과로 확인한다.
 */
export function runHpReconciliation<A extends ReconciliationApp>(app: A) {
  return api<ReconciliationRunOf[A]>(BASE[app], { method: 'POST' })
}
