import { http, HttpResponse, type AnyHandler } from 'msw'
import type {
  AdminExchange,
  AdminExchangePayout,
  ExchangePayoutStatus,
  ExchangeStatus,
} from '@/entities/wallet/types'
import type { PagedModel, RsData } from '@/shared/api/types'
import { ME_ID } from './renderApp'

/**
 * 테스트 전용: 관리자 환전 목록·상세·승인·거절과 송금 시도 조회·결과 재확인·재송금·최종 실패를 BE처럼 흉내 내는
 * MSW 핸들러(BE ExchangeReviewUseCase·ExchangePayoutUseCase). 데이터는 메모리에 두고 테스트마다
 * resetAdminExchangeDb()로 초기화한다. 응답 형식은 BE AdminExchangeResponse·AdminExchangePayoutResponse와 같다.
 * 처리 충돌은 화면이 그린 뒤 adminExchangeDb.items·payouts를 바꿔 만든다(다른 관리자 처리·회원 취소·자동 결과 확인).
 * 은행이 재확인·재송금에 줄 결과는 adminExchangeDb.bank로 정한다(UNAVAILABLE이면 503).
 */
export const adminExchange = (
  patch: Partial<AdminExchange> = {},
): AdminExchange => ({
  exchangeId: 1,
  userId: 21,
  requestedAmount: 10000,
  feeRate: 0.1,
  feeAmount: 1000,
  expectedPayoutAmount: 9000,
  status: 'REQUESTED',
  settlementRoundDate: '2026-11-10',
  requestedAt: '2026-10-16T02:00:00Z',
  canceledAt: null,
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  finalFailedBy: null,
  finalFailedAt: null,
  finalFailureReason: null,
  account: {
    bankCode: '004',
    accountNumberMasked: '**********1234',
    accountHolderName: '홍길동',
    verificationStatus: 'PENDING',
  },
  applicant: {
    nickname: '별빛',
    role: 'INFLUENCER',
    status: 'ACTIVE',
    approvable: true,
  },
  ...patch,
})

/** 송금 시도 하나. 기본은 환전 #61의 첫 자동 송금이 운영자 확인으로 넘어간 상태다 */
export const payoutAttempt = (
  patch: Partial<AdminExchangePayout> = {},
): AdminExchangePayout => ({
  exchangeId: 61,
  exchangeStatus: 'UNKNOWN',
  payoutId: 1,
  attemptNo: 1,
  payoutRequestId: '7d1c2a3e-0000-4000-8000-000000000001',
  status: 'MANUAL_REVIEW_REQUIRED',
  amountKrw: 9000,
  transactionId: null,
  failureReason: 'REJECTED_409:DUPLICATE',
  requestedAt: '2026-11-10T01:00:00Z',
  requestedBy: null,
  completedAt: null,
  failedAt: null,
  lastCheckedAt: '2026-11-10T01:00:00Z',
  resultCheckCount: 0,
  manualReviewAt: '2026-11-10T01:00:00Z',
  manualCheckedBy: null,
  manualCheckedAt: null,
  ...patch,
})

const sample = (): AdminExchange[] => [
  adminExchange({ exchangeId: 11, requestedAt: '2026-10-14T01:00:00Z' }),
  adminExchange({
    exchangeId: 12,
    userId: 22,
    requestedAmount: 50000,
    feeAmount: 5000,
    expectedPayoutAmount: 45000,
    requestedAt: '2026-10-15T01:00:00Z',
    applicant: null,
  }),
  adminExchange({
    exchangeId: 13,
    userId: 23,
    status: 'APPROVED',
    approvedBy: 9,
    approvedAt: '2026-10-15T05:00:00Z',
  }),
]

export const adminExchangeDb = {
  items: sample(),
  /** 요청한 status·page·size */
  listCalls: [] as {
    status: string | null
    page: string | null
    size: string | null
  }[],
  approveCalls: [] as number[],
  rejectCalls: [] as { exchangeId: number; body: unknown }[],
  /** 송금 시도 전부. exchangeStatus는 응답할 때 items에서 채운다 */
  payouts: [] as AdminExchangePayout[],
  /** 송금 시도 목록에 요청한 status·page·size */
  payoutListCalls: [] as {
    status: string | null
    page: string | null
    size: string | null
  }[],
  recheckCalls: [] as number[],
  retryCalls: [] as number[],
  finalFailureCalls: [] as { exchangeId: number; body: unknown }[],
  /** 결과 재확인·재송금에 은행이 줄 결과. UNKNOWN이면 여전히 모름, UNAVAILABLE이면 503 */
  bank: 'COMPLETED' as 'COMPLETED' | 'FAILED' | 'UNKNOWN' | 'UNAVAILABLE',
}

export function resetAdminExchangeDb(
  items = sample(),
  payouts: AdminExchangePayout[] = [],
) {
  adminExchangeDb.items = items
  adminExchangeDb.listCalls = []
  adminExchangeDb.approveCalls = []
  adminExchangeDb.rejectCalls = []
  adminExchangeDb.payouts = payouts
  adminExchangeDb.payoutListCalls = []
  adminExchangeDb.recheckCalls = []
  adminExchangeDb.retryCalls = []
  adminExchangeDb.finalFailureCalls = []
  adminExchangeDb.bank = 'COMPLETED'
}

const ok = <T>(data: T) =>
  HttpResponse.json<RsData<T>>({ statusCode: 200, message: 'mock', data })

const problem = (status: number, code: string) =>
  HttpResponse.json({ status, code, detail: `${code} 상세` }, { status })

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
  adminExchangeDb.items.find((x) => x.exchangeId === Number(id))

const replace = (next: AdminExchange) => {
  adminExchangeDb.items = adminExchangeDb.items.map((x) =>
    x.exchangeId === next.exchangeId ? next : x,
  )
  return next
}

const NOW = '2026-11-16T03:00:00Z'

/** 응답용 시도: 환전의 지금 상태를 채운다 */
const withExchange = (attempt: AdminExchangePayout): AdminExchangePayout => ({
  ...attempt,
  exchangeStatus: find(attempt.exchangeId)?.status ?? attempt.exchangeStatus,
})

const attemptsOf = (exchangeId: number) =>
  adminExchangeDb.payouts
    .filter((p) => p.exchangeId === exchangeId)
    .sort((a, b) => a.attemptNo - b.attemptNo)

const replacePayout = (next: AdminExchangePayout) => {
  adminExchangeDb.payouts = adminExchangeDb.payouts.map((p) =>
    p.payoutId === next.payoutId ? next : p,
  )
}

const setExchangeStatus = (exchangeId: number, status: ExchangeStatus) => {
  const found = find(exchangeId)
  if (found) replace({ ...found, status })
}

/** 은행 결과를 시도에 반영한다. 결과를 모르면 attempt를 그대로 둔다 */
function applyBank(attempt: AdminExchangePayout): AdminExchangePayout {
  const result = adminExchangeDb.bank
  if (result === 'COMPLETED') {
    setExchangeStatus(attempt.exchangeId, 'COMPLETED')
    return {
      ...attempt,
      status: 'COMPLETED',
      completedAt: NOW,
      transactionId: `TX-${attempt.payoutId}`,
    }
  }
  if (result === 'FAILED') {
    setExchangeStatus(attempt.exchangeId, 'FAILED')
    return {
      ...attempt,
      status: 'FAILED',
      failedAt: NOW,
      failureReason: 'MOCK_TRANSFER_REJECTED',
    }
  }
  return attempt
}

const CHECKABLE: ExchangePayoutStatus[] = [
  'PROCESSING',
  'UNKNOWN',
  'MANUAL_REVIEW_REQUIRED',
]

const payoutHandlers: AnyHandler[] = [
  // 운영자 확인 대상 목록. 오래된 시도부터 (BE와 같다). 상세(:exchangeId)보다 먼저 둔다.
  http.get('*/api/v1/settlements/admin/exchanges/payouts', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'MANUAL_REVIEW_REQUIRED'
    adminExchangeDb.payoutListCalls.push({
      status: url.searchParams.get('status'),
      page: url.searchParams.get('page'),
      size: url.searchParams.get('size'),
    })
    const items = adminExchangeDb.payouts
      .filter((p) => p.status === status)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
      .map(withExchange)
    return ok(page(items, url))
  }),
  http.get(
    '*/api/v1/settlements/admin/exchanges/:exchangeId/payouts',
    ({ params }) => {
      const id = Number(params.exchangeId)
      if (!find(id)) return problem(404, 'EXCHANGE_NOT_FOUND')
      return ok(attemptsOf(id).map(withExchange))
    },
  ),
  http.post(
    '*/api/v1/settlements/admin/exchanges/:exchangeId/payouts/recheck',
    ({ params }) => {
      const id = Number(params.exchangeId)
      adminExchangeDb.recheckCalls.push(id)
      if (!find(id)) return problem(404, 'EXCHANGE_NOT_FOUND')
      const last = attemptsOf(id).at(-1)
      if (!last || !CHECKABLE.includes(last.status))
        return problem(409, 'EXCHANGE_PAYOUT_NOT_CHECKABLE')
      if (adminExchangeDb.bank === 'UNAVAILABLE')
        return problem(503, 'EXCHANGE_PAYOUT_UNAVAILABLE')
      const next = applyBank({
        ...last,
        manualCheckedBy: ME_ID,
        manualCheckedAt: NOW,
      })
      replacePayout(next)
      return ok(withExchange(next))
    },
  ),
  http.post(
    '*/api/v1/settlements/admin/exchanges/:exchangeId/payouts/retry',
    ({ params }) => {
      const id = Number(params.exchangeId)
      adminExchangeDb.retryCalls.push(id)
      const found = find(id)
      if (!found) return problem(404, 'EXCHANGE_NOT_FOUND')
      if (found.status !== 'FAILED')
        return problem(409, 'EXCHANGE_PAYOUT_NOT_RETRYABLE')
      if (adminExchangeDb.bank === 'UNAVAILABLE')
        return problem(503, 'EXCHANGE_PAYOUT_UNAVAILABLE')
      const last = attemptsOf(id).at(-1)
      const attemptNo = (last?.attemptNo ?? 0) + 1
      setExchangeStatus(id, 'UNKNOWN')
      const next = applyBank(
        payoutAttempt({
          exchangeId: id,
          payoutId:
            Math.max(0, ...adminExchangeDb.payouts.map((p) => p.payoutId)) + 1,
          attemptNo,
          payoutRequestId: `7d1c2a3e-0000-4000-8000-00000000010${attemptNo}`,
          status: 'UNKNOWN',
          amountKrw: found.expectedPayoutAmount,
          failureReason:
            adminExchangeDb.bank === 'UNKNOWN' ? 'NO_RESPONSE' : null,
          requestedAt: NOW,
          requestedBy: ME_ID,
          lastCheckedAt: NOW,
          manualReviewAt: null,
        }),
      )
      adminExchangeDb.payouts = [...adminExchangeDb.payouts, next]
      return ok(withExchange(next))
    },
  ),
  http.post(
    '*/api/v1/settlements/admin/exchanges/:exchangeId/payouts/final-failure',
    async ({ params, request }) => {
      const id = Number(params.exchangeId)
      const body = (await request.json()) as { reason?: string }
      adminExchangeDb.finalFailureCalls.push({ exchangeId: id, body })
      const reason = body.reason?.trim() ?? ''
      if (!reason) return problem(400, 'INVALID_REQUEST')
      if (reason.length > 500)
        return problem(400, 'EXCHANGE_FINAL_FAILURE_REASON_INVALID')
      const found = find(id)
      if (!found) return problem(404, 'EXCHANGE_NOT_FOUND')
      if (found.status !== 'FAILED')
        return problem(409, 'EXCHANGE_PAYOUT_NOT_FINALIZABLE')
      return ok(
        replace({
          ...found,
          status: 'FINAL_FAILED',
          finalFailedBy: ME_ID,
          finalFailedAt: NOW,
          finalFailureReason: reason,
        }),
      )
    },
  ),
]

export const adminExchangeHandlers: AnyHandler[] = [
  ...payoutHandlers,
  // 승인 대기는 오래된 신청부터, 그 밖의 상태는 최신부터 (BE와 같다)
  http.get('*/api/v1/settlements/admin/exchanges', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'REQUESTED'
    adminExchangeDb.listCalls.push({
      status: url.searchParams.get('status'),
      page: url.searchParams.get('page'),
      size: url.searchParams.get('size'),
    })
    const items = adminExchangeDb.items
      .filter((x) => x.status === status)
      .sort((a, b) =>
        status === 'REQUESTED'
          ? a.requestedAt.localeCompare(b.requestedAt)
          : b.requestedAt.localeCompare(a.requestedAt),
      )
    return ok(page(items, url))
  }),
  http.get('*/api/v1/settlements/admin/exchanges/:exchangeId', ({ params }) => {
    const found = find(params.exchangeId)
    return found ? ok(found) : problem(404, 'EXCHANGE_NOT_FOUND')
  }),
  http.post(
    '*/api/v1/settlements/admin/exchanges/:exchangeId/approve',
    ({ params }) => {
      const id = Number(params.exchangeId)
      adminExchangeDb.approveCalls.push(id)
      const found = find(id)
      if (!found) return problem(404, 'EXCHANGE_NOT_FOUND')
      if (found.status === 'APPROVED' && found.approvedBy === ME_ID)
        return ok(found)
      if (found.status !== 'REQUESTED')
        return problem(409, 'EXCHANGE_ALREADY_REVIEWED')
      if (!found.applicant) return problem(409, 'EXCHANGE_APPLICANT_NOT_SYNCED')
      if (!found.applicant.approvable)
        return problem(409, 'EXCHANGE_APPLICANT_NOT_ELIGIBLE')
      return ok(
        replace({
          ...found,
          status: 'APPROVED',
          approvedBy: ME_ID,
          approvedAt: '2026-10-16T06:00:00Z',
        }),
      )
    },
  ),
  http.post(
    '*/api/v1/settlements/admin/exchanges/:exchangeId/reject',
    async ({ params, request }) => {
      const id = Number(params.exchangeId)
      const body = (await request.json()) as { rejectionReason?: string }
      adminExchangeDb.rejectCalls.push({ exchangeId: id, body })
      const reason = body.rejectionReason?.trim() ?? ''
      if (!reason) return problem(400, 'INVALID_REQUEST')
      if (reason.length > 500)
        return problem(400, 'EXCHANGE_REJECTION_REASON_INVALID')
      const found = find(id)
      if (!found) return problem(404, 'EXCHANGE_NOT_FOUND')
      if (found.status !== 'REQUESTED')
        return problem(409, 'EXCHANGE_ALREADY_REVIEWED')
      return ok(
        replace({
          ...found,
          status: 'REJECTED',
          rejectedBy: ME_ID,
          rejectedAt: '2026-10-16T06:00:00Z',
          rejectionReason: reason,
        }),
      )
    },
  ),
]
