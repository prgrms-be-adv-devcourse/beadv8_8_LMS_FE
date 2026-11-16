import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { AppearanceHpTask, AppearanceHpTaskStatus } from './types'

/** 목록 조건. BE는 상태를 생략하면 멈춤(DEAD)으로 보지만, 대시보드와 캐시를 함께 쓰도록 늘 보낸다 */
export type AppearanceHpTaskListParams = {
  status: AppearanceHpTaskStatus
  page: number
}

/** 다시 시도하면(실패해도) all 전체를 무효화한다: 목록과 대시보드 건수가 함께 바뀐다 */
export const appearanceHpTaskKeys = {
  all: ['appearance-hp-task'] as const,
  list: (params: AppearanceHpTaskListParams) =>
    [...appearanceHpTaskKeys.all, 'list', params] as const,
  /** 작업마다 고정한 다시 시도 mutation 키. 화면을 다시 열어도 진행 중인 요청을 알 수 있다 */
  retry: (taskId: number) =>
    [...appearanceHpTaskKeys.all, 'retry', taskId] as const,
}

export const APPEARANCE_HP_TASK_PAGE_SIZE = 20

/** 출연 HP 작업 목록 (관리자). 마지막으로 바뀐 작업부터(멈춤이면 멈춘 순)로 고정이라 정렬은 보내지 않는다 */
export const appearanceHpTasksQuery = (params: AppearanceHpTaskListParams) =>
  queryOptions({
    queryKey: appearanceHpTaskKeys.list(params),
    queryFn: () =>
      api<PagedModel<AppearanceHpTask>>('/appearances/admin/hp-tasks', {
        query: {
          status: params.status,
          page: params.page,
          size: APPEARANCE_HP_TASK_PAGE_SIZE,
        },
      }),
  })

/**
 * 멈춘(DEAD) 작업을 대기로 되돌리고 같은 멱등 키로 바로 1회 실행한 뒤, 실행한 다음의 작업을 준다(강의와 달리 배치를 기다리지 않는다).
 * 결과는 status로 본다: DONE 성공 / DEAD 지갑이 다시 거절 / PENDING 결과를 모름(재시도 배치가 이어서 실행). 다시 실패해도 200이다.
 * 없으면 404 HP_TASK_NOT_FOUND, 멈춘 작업이 아니면 409 HP_TASK_NOT_DEAD, 다른 관리자와 겹치면 409 CONCURRENT_UPDATE.
 */
export function retryAppearanceHpTask(taskId: number) {
  return api<AppearanceHpTask>(`/appearances/admin/hp-tasks/${taskId}/retry`, {
    method: 'POST',
  })
}
