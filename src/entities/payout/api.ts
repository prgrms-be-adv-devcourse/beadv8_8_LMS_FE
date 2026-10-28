import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { PayoutFailure } from './types'

export const payoutKeys = {
  all: ['payout'] as const,
  failures: (page: number) => [...payoutKeys.all, 'failures', page] as const,
  /** 격리 해제 mutation. 화면을 다시 열어도 진행 중인 요청을 알 수 있게 키를 고정한다 */
  release: () => [...payoutKeys.all, 'release'] as const,
}

export const PAYOUT_FAILURE_PAGE_SIZE = 20

/** 지급 실패 목록 (관리자). 최근 실패순으로 고정이라 정렬은 보내지 않는다 */
export const payoutFailuresQuery = (page: number) =>
  queryOptions({
    queryKey: payoutKeys.failures(page),
    queryFn: () =>
      api<PagedModel<PayoutFailure>>('/lectures/admin/payout-failures', {
        query: { page, size: PAYOUT_FAILURE_PAGE_SIZE },
      }),
  })

/** 격리 해제 (204). 바로 지급하지 않고 다음 지급 배치(매일 01:00)에서 다시 시도한다. 실패 기록은 남는다 */
export function releasePayoutQuarantine(orderItemId: number) {
  return api<void>(`/lectures/admin/payout-failures/${orderItemId}/retry`, {
    method: 'POST',
  })
}
