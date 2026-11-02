import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  HpTaskStatus,
  HpTaskType,
  LectureHpTask,
  LectureHpTaskDetail,
} from './types'

/** 목록 필터. 없는 값은 보내지 않는다(BE 필터는 모두 선택) */
export type HpTaskListParams = {
  status?: HpTaskStatus
  taskType?: HpTaskType
  page: number
}

/** 처리하면(실패해도) all 전체를 무효화한다: 목록·상세·대시보드 건수가 함께 바뀐다 */
export const hpTaskKeys = {
  all: ['lecture-hp-task'] as const,
  list: (params: HpTaskListParams) =>
    [...hpTaskKeys.all, 'list', params] as const,
  detail: (taskId: number) => [...hpTaskKeys.all, 'detail', taskId] as const,
  /** 재시도 mutation. 화면을 다시 열어도 진행 중인 요청을 알 수 있게 작업마다 키를 고정한다 */
  retry: (taskId: number) => [...hpTaskKeys.all, 'retry', taskId] as const,
}

export const HP_TASK_PAGE_SIZE = 20

/** 강의 HP 작업 목록 (관리자). 최신 작업순으로 고정이라 정렬은 보내지 않는다 */
export const lectureHpTasksQuery = (params: HpTaskListParams) =>
  queryOptions({
    queryKey: hpTaskKeys.list(params),
    queryFn: () =>
      api<PagedModel<LectureHpTask>>('/lectures/admin/hp-tasks', {
        query: {
          status: params.status,
          taskType: params.taskType,
          page: params.page,
          size: HP_TASK_PAGE_SIZE,
        },
      }),
  })

/** 작업과 시도 이력. 없으면 404 HP_TASK_NOT_FOUND */
export const lectureHpTaskQuery = (taskId: number) =>
  queryOptions({
    queryKey: hpTaskKeys.detail(taskId),
    queryFn: () =>
      api<LectureHpTaskDetail>(`/lectures/admin/hp-tasks/${taskId}`),
  })

/**
 * 자동 처리가 멈춘(DEAD) 작업을 대기로 돌린다(204). 바로 실행하지 않고 다음 재시도 배치(1분마다)가 같은 요청 ID로 보낸다.
 * 자동 재시도 횟수만 0이 되고 누적 횟수와 마지막 오류는 남는다. 없으면 404 HP_TASK_NOT_FOUND, DEAD가 아니면 409 HP_TASK_NOT_DEAD.
 */
export function retryLectureHpTask(taskId: number) {
  return api<void>(`/lectures/admin/hp-tasks/${taskId}/retry`, {
    method: 'POST',
  })
}
