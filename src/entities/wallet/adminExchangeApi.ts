import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { AdminExchangeFilter } from './exchangeReview'
import type { AdminExchange } from './types'

/**
 * 관리자 환전 조회. walletKeys 밖에 둬서 승인·거절이 관리자 본인 지갑을 다시 부르지 않게 한다.
 * 처리하면(실패해도) all 전체를 무효화한다: 목록·상세·대시보드 대기 건수가 함께 바뀐다.
 */
export const adminExchangeKeys = {
  all: ['admin-exchange'] as const,
  list: (status: AdminExchangeFilter, page: number) =>
    [...adminExchangeKeys.all, 'list', status, page] as const,
  detail: (exchangeId: number) =>
    [...adminExchangeKeys.all, 'detail', exchangeId] as const,
  /** 승인·거절 mutation. 화면을 다시 열어도 진행 중인 요청을 알 수 있게 키를 고정한다 */
  review: () => [...adminExchangeKeys.all, 'review'] as const,
}

export const ADMIN_EXCHANGE_PAGE_SIZE = 20

/** 상태별 환전 신청 목록. 승인 대기는 오래된 신청부터, 그 밖은 최신부터(BE가 정해 정렬은 보내지 않는다) */
export const adminExchangesQuery = (
  status: AdminExchangeFilter,
  page: number,
) =>
  queryOptions({
    queryKey: adminExchangeKeys.list(status, page),
    queryFn: () =>
      api<PagedModel<AdminExchange>>('/settlements/admin/exchanges', {
        query: { status, page, size: ADMIN_EXCHANGE_PAGE_SIZE },
      }),
  })

/** 환전 신청 하나. 없으면 404 EXCHANGE_NOT_FOUND */
export const adminExchangeQuery = (exchangeId: number) =>
  queryOptions({
    queryKey: adminExchangeKeys.detail(exchangeId),
    queryFn: () =>
      api<AdminExchange>(`/settlements/admin/exchanges/${exchangeId}`),
  })

/**
 * 승인 대기 신청을 승인한다(보류 유지, 송금하지 않음). 신청자 복제본이 없으면 409 EXCHANGE_APPLICANT_NOT_SYNCED,
 * 자격이 없으면 409 EXCHANGE_APPLICANT_NOT_ELIGIBLE, 이미 처리·취소됐으면 409 EXCHANGE_ALREADY_REVIEWED.
 */
export function approveExchange(exchangeId: number) {
  return api<AdminExchange>(
    `/settlements/admin/exchanges/${exchangeId}/approve`,
    { method: 'POST' },
  )
}

/** 승인 대기 신청을 거절하고 보류 HP를 신청자에게 돌려준다. 사유가 형식에 맞지 않으면 400 EXCHANGE_REJECTION_REASON_INVALID */
export function rejectExchange(exchangeId: number, rejectionReason: string) {
  return api<AdminExchange>(
    `/settlements/admin/exchanges/${exchangeId}/reject`,
    { method: 'POST', body: { rejectionReason } },
  )
}
