import { http, HttpResponse } from 'msw'
import type { Exchange, ExchangeRequest } from '@/entities/wallet/types'
import { rs } from './renderApp'
import { server } from './server'

/** BE 오류 본문(ProblemDetail) */
export const problem = (status: number, code: string) =>
  HttpResponse.json({ status, code, detail: `${code} 상세` }, { status })

/** 환전 신청 응답 픽스처 (BE ExchangeResponse) */
export const exchange = (patch: Partial<Exchange> = {}): Exchange => ({
  exchangeId: 1,
  requestedAmount: 10000,
  feeRate: 0.1,
  feeAmount: 1000,
  expectedPayoutAmount: 9000,
  status: 'REQUESTED',
  settlementRoundDate: '2026-11-10',
  requestedAt: '2026-10-16T02:00:00Z',
  canceledAt: null,
  completedAt: null,
  failedAt: null,
  account: {
    bankCode: '004',
    accountNumberMasked: '**********1234',
    accountHolderName: '홍길동',
    verificationStatus: 'PENDING',
  },
  ...patch,
})

/**
 * 환전 목록·상세 응답. items를 바꾸면 다음 조회부터 바뀐 값을 준다(다시 불러왔는지 확인용).
 * 목록은 요청한 page·size로 잘라 Spring Page처럼 돌려주고, 요청한 page·size를 기록한다.
 */
export function mockExchanges(initial: Exchange[] = []) {
  const state = { items: initial }
  const listCalls: { page: string | null; size: string | null }[] = []
  const detailCalls: number[] = []
  server.use(
    http.get('*/api/v1/settlements/exchanges', ({ request }) => {
      const url = new URL(request.url)
      const page = url.searchParams.get('page')
      const size = url.searchParams.get('size')
      listCalls.push({ page, size })
      const n = Number(page ?? 0)
      const s = Number(size ?? 20)
      return rs({
        content: state.items.slice(n * s, (n + 1) * s),
        page: {
          size: s,
          number: n,
          totalElements: state.items.length,
          totalPages: Math.ceil(state.items.length / s),
        },
      })
    }),
    http.get('*/api/v1/settlements/exchanges/:exchangeId', ({ params }) => {
      const id = Number(params.exchangeId)
      detailCalls.push(id)
      const found = state.items.find((x) => x.exchangeId === id)
      return found ? rs(found) : problem(404, 'EXCHANGE_NOT_FOUND')
    }),
  )
  return { state, listCalls, detailCalls }
}

/** 환전 신청 요청의 멱등키·본문을 모은다. */
export function mockRequestExchange(
  respond: (
    body: ExchangeRequest,
    call: number,
  ) => Response | Promise<Response>,
) {
  const calls: { key: string | null; body: ExchangeRequest }[] = []
  server.use(
    http.post('*/api/v1/settlements/exchanges', async ({ request }) => {
      const body = (await request.json()) as ExchangeRequest
      calls.push({ key: request.headers.get('Idempotency-Key'), body })
      return respond(body, calls.length)
    }),
  )
  return calls
}

/** 환전 신청 취소 요청. 부를 때마다 취소한 신청 ID를 모은다. */
export function mockCancelExchange(
  respond: (exchangeId: number) => Response | Promise<Response>,
) {
  const calls: number[] = []
  server.use(
    http.post(
      '*/api/v1/settlements/exchanges/:exchangeId/cancel',
      ({ params }) => {
        const id = Number(params.exchangeId)
        calls.push(id)
        return respond(id)
      },
    ),
  )
  return calls
}
