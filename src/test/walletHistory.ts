import { http } from 'msw'
import type {
  Earning,
  EarningSummary,
  PointChange,
  WalletTransaction,
} from '@/entities/wallet/types'
import { rs } from './renderApp'
import { server } from './server'

const ZERO: PointChange = {
  availableChangeHp: 0,
  heldChangeHp: 0,
  totalChangeHp: 0,
}

/** 충전 HP만 바뀐 거래 픽스처 (BE WalletTransactionResponse). 수익 HP 거래는 revenue를 넘긴다. */
export const transaction = (
  patch: Partial<WalletTransaction> = {},
): WalletTransaction => {
  const change: PointChange = {
    availableChangeHp: patch.availableChangeHp ?? 100000,
    heldChangeHp: patch.heldChangeHp ?? 0,
    totalChangeHp:
      (patch.availableChangeHp ?? 100000) + (patch.heldChangeHp ?? 0),
  }
  return {
    transactionId: 1,
    type: 'CHARGE',
    displayName: 'HP 충전',
    referenceType: 'POINT_CHARGE',
    referenceId: 1,
    occurredAt: '2026-10-16T11:00:00Z',
    ...change,
    charge: patch.revenue ? ZERO : change,
    revenue: ZERO,
    ...patch,
  }
}

/** 지급 예정 수익 픽스처 (BE EarningItemResponse) */
export const earning = (patch: Partial<Earning> = {}): Earning => ({
  sourceType: 'LECTURE',
  sourceId: 1,
  earningType: 'LECTURE_SALE',
  title: '방송 셋업 입문',
  amountHp: 45000,
  status: 'SCHEDULED',
  payoutScheduledAt: '2026-11-10T00:00:00Z',
  statusUpdatedAt: '2026-10-18T03:00:00Z',
  ...patch,
})

const amount = (amountHp = 0, count = 0) => ({ amountHp, count })

/** 지급 예정 수익 요약 픽스처 (BE EarningSummaryResponse) */
export const earningSummary = (
  patch: Partial<EarningSummary> = {},
): EarningSummary => ({
  confirmationPending: amount(),
  scheduled: amount(),
  onHold: amount(),
  processing: amount(),
  failed: amount(),
  total: amount(),
  asOf: '2026-10-19T05:30:00Z',
  ...patch,
})

/** 요청한 page·size로 잘라 Spring Page처럼 돌려준다. */
function paged<T>(items: T[], url: URL, defaultSize = 20) {
  const n = Number(url.searchParams.get('page') ?? 0)
  const s = Number(url.searchParams.get('size') ?? defaultSize)
  return rs({
    content: items.slice(n * s, (n + 1) * s),
    page: {
      size: s,
      number: n,
      totalElements: items.length,
      totalPages: Math.ceil(items.length / s),
    },
  })
}

/** 응답을 직접 만든다(실패 확인용). undefined를 돌려주면 기본 응답을 쓴다. */
type Respond = () => Response | undefined

type Call = { page: string | null; size: string | null; status: string[] }

const callOf = (url: URL): Call => ({
  page: url.searchParams.get('page'),
  size: url.searchParams.get('size'),
  status: url.searchParams.getAll('status'),
})

/**
 * 거래 원장 응답. items를 바꾸면 다음 조회부터 바뀐 값을 준다(다시 불러왔는지 확인용).
 * 요청한 page·size를 기록한다.
 */
export function mockTransactions(
  initial: WalletTransaction[] = [],
  respond?: Respond,
) {
  const state = { items: initial }
  const calls: Call[] = []
  server.use(
    http.get('*/api/v1/wallets/me/transactions', ({ request }) => {
      const url = new URL(request.url)
      calls.push(callOf(url))
      return respond?.() ?? paged(state.items, url)
    }),
  )
  return { state, calls }
}

/**
 * 지급 예정 수익 요약·목록 응답. 목록은 status가 없으면 미지급 다섯 상태만, 있으면 그 상태만 준다(BE와 같음).
 * respondSummary·respondList로 응답을 직접 만든다(503 확인용). 요청한 page·size·status를 기록한다.
 */
export function mockEarnings({
  summary = earningSummary(),
  items = [],
  respondSummary,
  respondList,
}: {
  summary?: EarningSummary
  items?: Earning[]
  respondSummary?: Respond
  respondList?: Respond
} = {}) {
  const state = { summary, items }
  const listCalls: Call[] = []
  let summaryCalls = 0
  const unpaid = new Set([
    'CONFIRMATION_PENDING',
    'SCHEDULED',
    'ON_HOLD',
    'PROCESSING',
    'FAILED',
  ])
  server.use(
    http.get('*/api/v1/settlements/earnings/summary', () => {
      summaryCalls++
      return respondSummary?.() ?? rs(state.summary)
    }),
    http.get('*/api/v1/settlements/earnings', ({ request }) => {
      const url = new URL(request.url)
      const call = callOf(url)
      listCalls.push(call)
      const custom = respondList?.()
      if (custom) return custom
      const wanted = call.status.length > 0 ? new Set(call.status) : unpaid
      return paged(
        state.items.filter((item) => wanted.has(item.status)),
        url,
      )
    }),
  )
  return { state, listCalls, summaryCalls: () => summaryCalls }
}
