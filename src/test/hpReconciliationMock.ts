import { http, HttpResponse, type AnyHandler } from 'msw'
import type {
  AppearanceReconciliationRun,
  LectureReconciliationRun,
  ReconciliationApp,
} from '@/entities/hp-reconciliation/types'
import type { RsData } from '@/shared/api/types'
import { ME_ID } from './renderApp'

/**
 * 테스트 전용: 관리자 HP 대사 마지막 결과·지금 실행을 BE처럼 흉내 내는 MSW 핸들러
 * (BE ApiV1LectureHpReconciliationAdminController·ApiV1AppearanceHpReconciliationAdminController).
 * 데이터는 메모리에 두고 테스트마다 resetHpReconciliationDb()로 초기화한다.
 */

export const lectureRun = (
  patch: Partial<LectureReconciliationRun> = {},
): LectureReconciliationRun => ({
  id: 12,
  triggerType: 'SCHEDULED',
  triggeredBy: null,
  status: 'COMPLETED',
  startedAt: '2026-11-15T04:00:00',
  finishedAt: '2026-11-15T04:03:10',
  checkedCount: 1240,
  mismatchCount: 2,
  deadCount: 1,
  failureReason: null,
  mismatches: [
    {
      id: 301,
      orderItemId: 702,
      orderId: 601,
      rule: 'HOLD_BALANCE_MISMATCH',
      itemStatus: 'CANCELED',
      lectureState:
        '항목 702 · 주문 601 · CANCELED · 9000 HP · 구매자 32 · 판매자 21',
      walletState: '보류 9000 (HELD 9000) · 무효화 없음 · 지급 건 없음',
    },
    {
      id: 302,
      orderItemId: 799,
      orderId: null,
      rule: 'WALLET_ONLY_HOLD',
      itemStatus: null,
      lectureState: '강의에 항목 없음',
      walletState: '보류 5000 (HELD 5000)',
    },
    {
      id: 303,
      orderItemId: 705,
      orderId: 604,
      rule: 'HP_TASK_DEAD',
      itemStatus: 'HOLD_PENDING',
      lectureState: '항목 705 · 주문 604 · HOLD_PENDING · DEAD 작업 #75',
      walletState: '비교하지 않음',
    },
  ],
  ...patch,
})

export const appearanceRun = (
  patch: Partial<AppearanceReconciliationRun> = {},
): AppearanceReconciliationRun => ({
  id: 7,
  triggerType: 'MANUAL',
  triggeredBy: 9,
  status: 'INCOMPLETE',
  startedAt: '2026-11-15T05:00:00',
  finishedAt: '2026-11-15T05:00:40',
  checkedCount: 88,
  mismatchCount: 1,
  deadCount: 1,
  failureReason: '지갑 보류 목록 조회 실패: 503 Service Unavailable',
  mismatches: [
    {
      id: 41,
      referenceType: 'APPEARANCE_REQUEST',
      referenceId: 55,
      appearanceId: 120,
      rule: 'HP_TASK_MISMATCH',
      appearanceState:
        '요청서 55 ACCEPTED · 출연 120 COMPLETED · 기대 지급 30000',
      walletState: '보류 30000 · 지급 건 없음',
    },
    {
      id: 42,
      referenceType: 'APPEARANCE_RECRUIT',
      referenceId: 8,
      appearanceId: null,
      rule: 'HP_TASK_DEAD',
      appearanceState: '모집글 8 · DEAD 작업 #14',
      walletState: '비교하지 않음',
    },
  ],
  ...patch,
})

/** 결과는 없고 실행 중인 상태(BE: 실행 중이면 어긋난 건이 비어 있다) */
export const running = <R extends { mismatches: unknown[] }>(run: R): R => ({
  ...run,
  status: 'RUNNING',
  finishedAt: null,
  checkedCount: 0,
  mismatchCount: 0,
  deadCount: 0,
  failureReason: null,
  mismatches: [],
})

type AnyRun = LectureReconciliationRun | AppearanceReconciliationRun

export const hpReconciliationDb = {
  /** 마지막 결과. null이면 404 HP_RECONCILIATION_NOT_FOUND */
  latest: { lecture: null, appearance: null } as Record<
    ReconciliationApp,
    AnyRun | null
  >,
  /** 지금 실행이 끝나면 돌려줄 결과(받은 관리자 ID를 채운다) */
  next: {} as Partial<Record<ReconciliationApp, AnyRun>>,
  /** 지금 실행 응답을 직접 만든다(연결 끊김·지연 확인용) */
  onRun: {} as Partial<
    Record<ReconciliationApp, () => Response | Promise<Response>>
  >,
  latestCalls: { lecture: 0, appearance: 0 },
  runCalls: { lecture: 0, appearance: 0 },
}

export function resetHpReconciliationDb() {
  hpReconciliationDb.latest = { lecture: lectureRun(), appearance: null }
  hpReconciliationDb.next = {}
  hpReconciliationDb.onRun = {}
  hpReconciliationDb.latestCalls = { lecture: 0, appearance: 0 }
  hpReconciliationDb.runCalls = { lecture: 0, appearance: 0 }
}

const ok = <T>(data: T) =>
  HttpResponse.json<RsData<T>>({ statusCode: 200, message: 'mock', data })

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

const BASE: Record<ReconciliationApp, string> = {
  lecture: '*/api/v1/lectures/admin/hp-reconciliations',
  appearance: '*/api/v1/appearances/admin/hp-reconciliations',
}

export const hpReconciliationHandlers: AnyHandler[] = (
  ['lecture', 'appearance'] as const
).flatMap((app) => [
  http.get(`${BASE[app]}/latest`, () => {
    hpReconciliationDb.latestCalls[app]++
    const run = hpReconciliationDb.latest[app]
    if (!run)
      return problem(
        404,
        'HP_RECONCILIATION_NOT_FOUND',
        'HP 대사 실행 기록이 없습니다.',
      )
    return ok(run)
  }),
  http.post(BASE[app], () => {
    hpReconciliationDb.runCalls[app]++
    const custom = hpReconciliationDb.onRun[app]
    if (custom) return custom()
    if (hpReconciliationDb.latest[app]?.status === 'RUNNING')
      return problem(
        409,
        'HP_RECONCILIATION_RUNNING',
        'HP 대사가 이미 실행 중입니다.',
      )
    const base =
      hpReconciliationDb.next[app] ??
      (app === 'lecture' ? lectureRun() : appearanceRun())
    const run = { ...base, triggerType: 'MANUAL', triggeredBy: ME_ID } as AnyRun
    hpReconciliationDb.latest[app] = run
    return ok(run)
  }),
])
