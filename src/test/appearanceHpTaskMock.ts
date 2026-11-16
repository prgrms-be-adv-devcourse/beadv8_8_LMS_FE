import { http, HttpResponse, type AnyHandler } from 'msw'
import type {
  AppearanceHpTask,
  AppearanceHpTaskStatus,
} from '@/entities/appearance-hp-task/types'
import type { PagedModel, RsData } from '@/shared/api/types'
import { ME_ID } from './renderApp'

/**
 * 테스트 전용: 관리자 출연 HP 작업 목록·다시 시도를 BE처럼 흉내 내는 MSW 핸들러(BE ApiV1AppearanceHpTaskAdminController).
 * 데이터는 메모리에 두고 테스트마다 resetAppearanceHpTaskDb()로 초기화한다. 응답 형식은 BE HpTaskAdminResDto와 같다.
 */
export const appearanceHpTask = (
  patch: Partial<AppearanceHpTask> = {},
): AppearanceHpTask => ({
  id: 1,
  taskType: 'RELEASE',
  refType: 'APPEARANCE_REQUEST',
  refId: 300,
  appearanceId: null,
  memberId: 11,
  receiverId: null,
  amount: 30000,
  payoutAmount: null,
  reason: 'REQUEST_REJECTED',
  idempotencyKey: 'appearance-release-request-300',
  status: 'DEAD',
  attemptCount: 0,
  nextAttemptAt: '2026-10-20T10:00:00',
  lastError: null,
  completedAt: null,
  createdAt: '2026-10-20T10:00:00',
  manualRetryCount: 0,
  lastManualRetryBy: null,
  lastManualRetryAt: null,
  ...patch,
})

const sample = (): AppearanceHpTask[] => [
  // 호스트 일방 취소의 위약금 정산: 지갑이 거절해 멈췄다
  appearanceHpTask({
    id: 41,
    taskType: 'PENALTY',
    refId: 301,
    appearanceId: 501,
    receiverId: 22,
    amount: 50000,
    payoutAmount: 15000,
    reason: 'HOST_CANCELED',
    idempotencyKey: 'appearance-penalty-501',
    attemptCount: 1,
    lastError: 'HOLD_ALREADY_CLOSED: 남은 보류가 없습니다.',
    completedAt: '2026-10-21T09:00:05',
    createdAt: '2026-10-21T09:00:00',
  }),
  // 모집 마감 때 성립하지 못한 자리의 반환: 재시도를 다 써서 멈췄고, 관리자가 한 번 다시 시도했다
  appearanceHpTask({
    id: 42,
    refType: 'APPEARANCE_RECRUIT',
    refId: 77,
    amount: 20000,
    reason: 'RECRUIT_CLOSED',
    idempotencyKey: 'appearance-release-recruit-77',
    attemptCount: 5,
    lastError: 'Read timed out',
    completedAt: '2026-10-21T12:30:00',
    createdAt: '2026-10-21T12:00:00',
    manualRetryCount: 1,
    lastManualRetryBy: 5,
    lastManualRetryAt: '2026-10-21T12:10:00',
  }),
  // 출연 확인 지급: 자동 재시도 중
  appearanceHpTask({
    id: 43,
    status: 'PENDING',
    taskType: 'PAYOUT',
    refId: 302,
    appearanceId: 502,
    receiverId: 23,
    amount: 40000,
    payoutAmount: 40000,
    reason: 'APPEARANCE_CONFIRMED',
    idempotencyKey: 'appearance-payout-502',
    attemptCount: 2,
    nextAttemptAt: '2026-10-22T08:05:00',
    lastError: 'HP_LOCK_TIMEOUT: 잠시 후 다시 시도해 주세요.',
    createdAt: '2026-10-22T08:00:00',
  }),
  appearanceHpTask({
    id: 44,
    status: 'DONE',
    reason: 'REQUEST_EXPIRED',
    refId: 303,
    idempotencyKey: 'appearance-release-request-303',
    attemptCount: 1,
    completedAt: '2026-10-22T09:00:01',
    createdAt: '2026-10-22T09:00:00',
  }),
]

export const appearanceHpTaskDb = {
  items: sample(),
  /** 목록 요청의 검색어 */
  listCalls: [] as string[],
  retryCalls: [] as number[],
  /** 다시 시도로 바로 실행한 결과. DEAD면 retryError가 마지막 오류가 된다 */
  retryResult: 'DONE' as AppearanceHpTaskStatus,
  retryError: 'HOLD_ALREADY_CLOSED: 남은 보류가 없습니다.',
}

export function resetAppearanceHpTaskDb(items = sample()) {
  appearanceHpTaskDb.items = items
  appearanceHpTaskDb.listCalls = []
  appearanceHpTaskDb.retryCalls = []
  appearanceHpTaskDb.retryResult = 'DONE'
  appearanceHpTaskDb.retryError = 'HOLD_ALREADY_CLOSED: 남은 보류가 없습니다.'
}

const ok = <T>(data: T) =>
  HttpResponse.json<RsData<T>>({ statusCode: 200, message: 'mock', data })

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

function page<T>(items: T[], url: URL): PagedModel<T> {
  const number = Number(url.searchParams.get('page') ?? 0)
  const size = Number(url.searchParams.get('size') ?? 20)
  return {
    content: items.slice(number * size, number * size + size),
    page: {
      number,
      size,
      totalElements: items.length,
      totalPages: Math.ceil(items.length / size),
    },
  }
}

/** 마지막으로 바뀐 시각(BE updatedAt 대신 기록된 시각 중 가장 늦은 것) */
const changedAt = (t: AppearanceHpTask) =>
  [t.createdAt, t.completedAt, t.lastManualRetryAt]
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1)!

/** BE HpTaskSupport.findByStatus와 같다: 상태 생략은 DEAD, 정렬은 요청과 관계없이 마지막으로 바뀐 작업부터 */
function search(url: URL) {
  const status = url.searchParams.get('status') ?? 'DEAD'
  return appearanceHpTaskDb.items
    .filter((t) => t.status === status)
    .sort((a, b) => changedAt(b).localeCompare(changedAt(a)))
}

export const appearanceHpTaskHandlers: AnyHandler[] = [
  http.get('*/api/v1/appearances/admin/hp-tasks', ({ request }) => {
    const url = new URL(request.url)
    appearanceHpTaskDb.listCalls.push(url.searchParams.toString())
    return ok(page(search(url), url))
  }),
  http.post(
    '*/api/v1/appearances/admin/hp-tasks/:taskId/retry',
    ({ params }) => {
      const id = Number(params.taskId)
      appearanceHpTaskDb.retryCalls.push(id)
      const task = appearanceHpTaskDb.items.find((t) => t.id === id)
      if (!task)
        return problem(404, 'HP_TASK_NOT_FOUND', 'HP 작업을 찾을 수 없습니다.')
      if (task.status !== 'DEAD')
        return problem(
          409,
          'HP_TASK_NOT_DEAD',
          '격리된(DEAD) HP 작업만 다시 시도할 수 있습니다.',
        )
      // 대기로 되돌려 시도 횟수를 0부터 다시 세고 다시 시도 기록을 남긴 뒤(BE HpTask.reopenForManualRetry) 바로 1회 실행한다
      const now = '2026-10-23T09:00:00'
      const result = appearanceHpTaskDb.retryResult
      Object.assign(task, {
        status: result,
        attemptCount: 1,
        manualRetryCount: task.manualRetryCount + 1,
        lastManualRetryBy: ME_ID,
        lastManualRetryAt: now,
        ...(result === 'DONE' && { completedAt: '2026-10-23T09:00:01' }),
        ...(result === 'DEAD' && {
          lastError: appearanceHpTaskDb.retryError,
          completedAt: '2026-10-23T09:00:01',
        }),
        ...(result === 'PENDING' && {
          completedAt: null,
          nextAttemptAt: '2026-10-23T09:01:00',
          lastError: 'Read timed out',
        }),
      } satisfies Partial<AppearanceHpTask>)
      return ok({ ...task })
    },
  ),
]
