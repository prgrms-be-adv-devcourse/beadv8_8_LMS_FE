import { http, HttpResponse, type AnyHandler } from 'msw'
import type { AdminExchange } from '@/entities/wallet/types'
import type { PagedModel, RsData } from '@/shared/api/types'
import { ME_ID } from './renderApp'

/**
 * 테스트 전용: 관리자 환전 목록·상세·승인·거절을 BE처럼 흉내 내는 MSW 핸들러(BE #294 ExchangeReviewUseCase).
 * 데이터는 메모리에 두고 테스트마다 resetAdminExchangeDb()로 초기화한다. 응답 형식은 BE AdminExchangeResponse와 같다.
 * 처리 충돌은 화면이 그린 뒤 adminExchangeDb.items를 바꿔 만든다(다른 관리자 처리·회원 취소).
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
}

export function resetAdminExchangeDb(items = sample()) {
  adminExchangeDb.items = items
  adminExchangeDb.listCalls = []
  adminExchangeDb.approveCalls = []
  adminExchangeDb.rejectCalls = []
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

export const adminExchangeHandlers: AnyHandler[] = [
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
