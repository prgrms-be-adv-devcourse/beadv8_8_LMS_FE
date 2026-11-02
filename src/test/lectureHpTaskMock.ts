import { http, HttpResponse, type AnyHandler } from 'msw'
import type {
  LectureHpTask,
  LectureHpTaskAttempt,
} from '@/entities/hp-task/types'
import type { PagedModel, RsData } from '@/shared/api/types'
import { ME_ID } from './renderApp'

/**
 * 테스트 전용: 관리자 강의 HP 작업 목록·상세·재시도를 BE처럼 흉내 내는 MSW 핸들러(BE ApiV1LectureHpTaskAdminController).
 * 데이터는 메모리에 두고 테스트마다 resetLectureHpTaskDb()로 초기화한다. 응답 형식은 BE LectureHpTaskResponse·LectureHpTaskDetailResponse와 같다.
 */
export const lectureHpTask = (
  patch: Partial<LectureHpTask> = {},
): LectureHpTask => ({
  id: 1,
  status: 'DEAD',
  outcome: null,
  taskType: 'PAYOUT',
  purpose: 'PAYOUT',
  requestId: 'LECTURE-PAYOUT-701',
  orderId: 600,
  orderItemId: 701,
  payerUserId: 31,
  receiverUserId: 21,
  amountHp: 15000,
  attemptCount: 0,
  totalAttemptCount: 0,
  manualRetryCount: 0,
  nextAttemptAt: '2026-10-15T01:00:00',
  lastErrorCode: null,
  lastFailedAt: null,
  lastRetriedByUserId: null,
  lastRetriedAt: null,
  completedAt: null,
  createdAt: '2026-10-15T01:00:00',
  ...patch,
})

const sample = (): LectureHpTask[] => [
  // HP 작업으로 옮기기 전 지급 배치에서 격리된 지급: 실패 횟수만 옮겨 와 시도 이력이 없다
  lectureHpTask({
    id: 71,
    totalAttemptCount: 1,
    lastErrorCode: 'PAYOUT_AMOUNT_MISMATCH',
    lastFailedAt: '2026-10-15T01:00:03',
  }),
  lectureHpTask({
    id: 72,
    taskType: 'RELEASE',
    purpose: 'CANCEL',
    requestId: 'LECTURE-CANCEL-702',
    orderId: 601,
    orderItemId: 702,
    payerUserId: 32,
    receiverUserId: null,
    amountHp: 9000,
    attemptCount: 2,
    totalAttemptCount: 2,
    lastErrorCode: 'HOLD_ALREADY_CLOSED',
    lastFailedAt: '2026-10-16T10:01:05',
    createdAt: '2026-10-16T10:00:00',
  }),
  lectureHpTask({
    id: 73,
    status: 'PENDING',
    requestId: 'LECTURE-PAYOUT-703',
    orderId: 602,
    orderItemId: 703,
    receiverUserId: 23,
    amountHp: 12000,
    attemptCount: 3,
    totalAttemptCount: 3,
    nextAttemptAt: '2026-10-16T10:08:00',
    lastErrorCode: 'WALLET_NOT_FOUND',
    lastFailedAt: '2026-10-16T10:04:00',
    createdAt: '2026-10-16T10:00:00',
  }),
  lectureHpTask({
    id: 74,
    status: 'COMPLETED',
    outcome: 'SUCCEEDED',
    taskType: 'HOLD',
    purpose: 'ORDER_HOLD',
    requestId: 'LECTURE-HOLD-704',
    orderId: 603,
    orderItemId: 704,
    receiverUserId: null,
    amountHp: 5000,
    attemptCount: 1,
    totalAttemptCount: 1,
    completedAt: '2026-10-16T11:00:01',
    createdAt: '2026-10-16T11:00:00',
  }),
]

const sampleAttempts = (): Record<number, LectureHpTaskAttempt[]> => ({
  72: [
    {
      attemptNo: 1,
      result: 'UNKNOWN_RESULT',
      errorCode: 'UNKNOWN_RESULT',
      rawErrorCode: 'HP_LOCK_TIMEOUT',
      errorDetail: 'BillingCallException: 503 잠시 후 다시 시도해 주세요.',
      startedAt: '2026-10-16T10:00:00',
      completedAt: '2026-10-16T10:00:02',
    },
    {
      attemptNo: 2,
      result: 'INVARIANT_VIOLATION',
      errorCode: 'HOLD_ALREADY_CLOSED',
      rawErrorCode: 'HOLD_ALREADY_CLOSED',
      errorDetail: '409 남은 보류가 없습니다.',
      startedAt: '2026-10-16T10:01:04',
      completedAt: '2026-10-16T10:01:05',
    },
  ],
  73: [1, 2, 3].map((attemptNo) => ({
    attemptNo,
    result: 'RETRYABLE' as const,
    errorCode: 'WALLET_NOT_FOUND',
    rawErrorCode: 'WALLET_NOT_FOUND',
    errorDetail: '404 지갑을 찾을 수 없습니다.',
    startedAt: `2026-10-16T10:0${attemptNo}:00`,
    completedAt: `2026-10-16T10:0${attemptNo}:01`,
  })),
  74: [
    {
      attemptNo: 1,
      result: 'SUCCEEDED',
      errorCode: null,
      rawErrorCode: null,
      errorDetail: null,
      startedAt: '2026-10-16T11:00:00',
      completedAt: '2026-10-16T11:00:01',
    },
  ],
})

export const lectureHpTaskDb = {
  items: sample(),
  attempts: sampleAttempts(),
  /** 목록 요청의 검색어 */
  listCalls: [] as string[],
  retryCalls: [] as number[],
}

export function resetLectureHpTaskDb(items = sample()) {
  lectureHpTaskDb.items = items
  lectureHpTaskDb.attempts = sampleAttempts()
  lectureHpTaskDb.listCalls = []
  lectureHpTaskDb.retryCalls = []
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

const find = (id: unknown) =>
  lectureHpTaskDb.items.find((t) => t.id === Number(id))

/** BE LectureHpTaskSupport.search와 같다: 필터는 모두 선택, 최신 작업(id 큰 것)부터, 주문 항목이 아닌 참조 유형은 결과 없음 */
function search(url: URL) {
  const q = url.searchParams
  if (q.has('referenceType') && q.get('referenceType') !== 'LECTURE_ORDER_ITEM')
    return []
  const eq = (key: string, value: unknown) =>
    !q.has(key) || q.get(key) === String(value)
  return lectureHpTaskDb.items
    .filter(
      (t) =>
        eq('status', t.status) &&
        eq('taskType', t.taskType) &&
        eq('orderId', t.orderId) &&
        eq('orderItemId', t.orderItemId) &&
        eq('errorCode', t.lastErrorCode),
    )
    .sort((a, b) => b.id - a.id)
}

export const lectureHpTaskHandlers: AnyHandler[] = [
  http.get('*/api/v1/lectures/admin/hp-tasks', ({ request }) => {
    const url = new URL(request.url)
    lectureHpTaskDb.listCalls.push(url.searchParams.toString())
    return ok(page(search(url), url))
  }),
  http.get('*/api/v1/lectures/admin/hp-tasks/:taskId', ({ params }) => {
    const task = find(params.taskId)
    if (!task)
      return problem(404, 'HP_TASK_NOT_FOUND', 'HP 작업을 찾을 수 없습니다.')
    return ok({ task, attempts: lectureHpTaskDb.attempts[task.id] ?? [] })
  }),
  http.post('*/api/v1/lectures/admin/hp-tasks/:taskId/retry', ({ params }) => {
    const id = Number(params.taskId)
    lectureHpTaskDb.retryCalls.push(id)
    const task = find(id)
    if (!task)
      return problem(404, 'HP_TASK_NOT_FOUND', 'HP 작업을 찾을 수 없습니다.')
    if (task.status !== 'DEAD')
      return problem(
        409,
        'HP_TASK_NOT_DEAD',
        '자동 처리가 멈춘(DEAD) HP 작업만 재시도할 수 있습니다.',
      )
    // 자동 재시도 횟수만 0으로 하고 누적 횟수·마지막 오류는 남긴다 (BE LectureHpTask.retryManually)
    Object.assign(task, {
      status: 'PENDING',
      attemptCount: 0,
      manualRetryCount: task.manualRetryCount + 1,
      lastRetriedByUserId: ME_ID,
      lastRetriedAt: '2026-10-17T09:00:00',
      nextAttemptAt: '2026-10-17T09:00:00',
    } satisfies Partial<LectureHpTask>)
    return new HttpResponse(null, { status: 204 })
  }),
]
