import { http, HttpResponse, type AnyHandler } from 'msw'
import type { PayoutFailure } from '@/entities/payout/types'
import type { PagedModel, RsData } from '@/shared/api/types'

/**
 * 테스트 전용: 관리자 강의 지급 실패 목록·격리 해제를 BE처럼 흉내 내는 MSW 핸들러.
 * 데이터는 메모리에 두고 테스트마다 resetPayoutFailureDb()로 초기화한다. 응답 형식은 BE PayoutFailureResponse와 같다.
 */
const sample = (): PayoutFailure[] => [
  {
    orderItemId: 701,
    orderId: 600,
    lectureId: 7,
    sellerUserId: 21,
    buyerUserId: 31,
    priceHp: 15000,
    payoutScheduledAt: '2026-10-15T00:00:00',
    payoutFailureCount: 1,
    lastPayoutFailureCode: 'PAYOUT_AMOUNT_MISMATCH',
    lastPayoutFailedAt: '2026-10-15T01:00:03',
    payoutQuarantinedAt: '2026-10-15T01:00:03',
  },
  {
    orderItemId: 702,
    orderId: 601,
    lectureId: 8,
    sellerUserId: 22,
    buyerUserId: 32,
    priceHp: 9000,
    payoutScheduledAt: '2026-10-14T00:00:00',
    payoutFailureCount: 3,
    lastPayoutFailureCode: 'WALLET_NOT_FOUND',
    lastPayoutFailedAt: '2026-10-15T01:00:02',
    payoutQuarantinedAt: null,
  },
  {
    orderItemId: 703,
    orderId: 602,
    lectureId: 9,
    sellerUserId: 23,
    buyerUserId: 33,
    priceHp: 12000,
    payoutScheduledAt: '2026-10-13T00:00:00',
    payoutFailureCount: 2,
    lastPayoutFailureCode: 'ObjectOptimisticLockingFailureException',
    lastPayoutFailedAt: '2026-10-15T01:00:01',
    payoutQuarantinedAt: null,
  },
]

export const payoutFailureDb = { items: sample() }

export function resetPayoutFailureDb() {
  payoutFailureDb.items = sample()
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

export const payoutFailureHandlers: AnyHandler[] = [
  // 최근 실패순 고정 (BE와 같다)
  http.get('*/api/v1/lectures/admin/payout-failures', ({ request }) =>
    ok(
      page(
        [...payoutFailureDb.items].sort((a, b) =>
          b.lastPayoutFailedAt.localeCompare(a.lastPayoutFailedAt),
        ),
        new URL(request.url),
      ),
    ),
  ),
  http.post(
    '*/api/v1/lectures/admin/payout-failures/:orderItemId/retry',
    ({ params }) => {
      const item = payoutFailureDb.items.find(
        (i) => i.orderItemId === Number(params.orderItemId),
      )
      if (!item)
        return problem(
          404,
          'ORDER_ITEM_NOT_FOUND',
          '주문 항목을 찾을 수 없습니다.',
        )
      if (!item.payoutQuarantinedAt)
        return problem(
          409,
          'PAYOUT_NOT_QUARANTINED',
          '지급이 격리된 항목이 아닙니다.',
        )
      item.payoutQuarantinedAt = null
      return new HttpResponse(null, { status: 204 })
    },
  ),
]
