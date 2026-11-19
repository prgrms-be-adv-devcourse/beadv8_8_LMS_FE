import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { AdminExchangeFilter } from './exchangeReview'
import type { AdminPayoutFilter } from './exchangePayout'
import type { AdminExchange, AdminExchangePayout } from './types'

/**
 * 관리자 환전 조회. walletKeys 밖에 둬서 승인·거절이 관리자 본인 지갑을 다시 부르지 않게 한다.
 * 처리하면(실패해도) all 전체를 무효화한다: 목록·상세·송금 시도·대시보드 건수가 함께 바뀐다.
 */
export const adminExchangeKeys = {
  all: ['admin-exchange'] as const,
  list: (status: AdminExchangeFilter, page: number) =>
    [...adminExchangeKeys.all, 'list', status, page] as const,
  detail: (exchangeId: number) =>
    [...adminExchangeKeys.all, 'detail', exchangeId] as const,
  /** 승인·거절 mutation. 화면을 다시 열어도 진행 중인 요청을 알 수 있게 키를 고정한다 */
  review: () => [...adminExchangeKeys.all, 'review'] as const,
  /** 운영자 확인 대상 송금 시도 목록(상태별) */
  payouts: (status: AdminPayoutFilter, page: number) =>
    [...adminExchangeKeys.all, 'payouts', status, page] as const,
  /** 환전 하나의 송금 시도 이력 */
  payoutsOf: (exchangeId: number) =>
    [...adminExchangeKeys.all, 'payouts-of', exchangeId] as const,
  /** 환전마다 고정한 송금 처리(재확인·재송금·최종 실패) mutation 키. 셋 중 하나가 진행 중이면 다른 것도 보내지 못한다 */
  payout: (exchangeId: number) =>
    [...adminExchangeKeys.all, 'payout', exchangeId] as const,
  /** 재송금 mutation. 송금 처리 키 아래에 둬서 진행 중 여부는 함께 보고, 결과는 송금 패널이 따로 읽는다 */
  payoutRetry: (exchangeId: number) =>
    [...adminExchangeKeys.payout(exchangeId), 'retry'] as const,
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
    placeholderData: keepPreviousData,
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

export const ADMIN_PAYOUT_PAGE_SIZE = 20

/** 상태별 송금 시도 목록. 오래된 시도부터(BE가 정해 정렬은 보내지 않는다). 계좌번호는 담지 않는다 */
export const adminExchangePayoutsQuery = (
  status: AdminPayoutFilter,
  page: number,
) =>
  queryOptions({
    queryKey: adminExchangeKeys.payouts(status, page),
    queryFn: () =>
      api<PagedModel<AdminExchangePayout>>(
        '/settlements/admin/exchanges/payouts',
        { query: { status, page, size: ADMIN_PAYOUT_PAGE_SIZE } },
      ),
    placeholderData: keepPreviousData,
  })

/** 환전 하나의 송금 시도 전부(시도 번호 순). 없으면 404 EXCHANGE_NOT_FOUND */
export const adminExchangePayoutsOfQuery = (exchangeId: number) =>
  queryOptions({
    queryKey: adminExchangeKeys.payoutsOf(exchangeId),
    queryFn: () =>
      api<AdminExchangePayout[]>(
        `/settlements/admin/exchanges/${exchangeId}/payouts`,
      ),
  })

/**
 * 결과가 확정되지 않은 마지막 시도를 기존 지급 요청 ID로 은행에 조회만 하고(새로 보내지 않는다) 그 시도를 준다.
 * 결과는 status로 본다: COMPLETED 성공 / FAILED 확정 실패 / 그 밖은 여전히 모름.
 * 확인할 시도가 없으면 409 EXCHANGE_PAYOUT_NOT_CHECKABLE, 송금을 쓸 수 없으면 503 EXCHANGE_PAYOUT_UNAVAILABLE.
 */
export function recheckExchangePayout(exchangeId: number) {
  return api<AdminExchangePayout>(
    `/settlements/admin/exchanges/${exchangeId}/payouts/recheck`,
    { method: 'POST' },
  )
}

/**
 * 송금이 확정 실패한(FAILED) 환전을 새 지급 요청 ID로 다시 보내고 새 시도를 준다.
 * 그 밖의 상태는 409 EXCHANGE_PAYOUT_NOT_RETRYABLE, 송금을 쓸 수 없으면 503 EXCHANGE_PAYOUT_UNAVAILABLE.
 */
export function retryExchangePayout(exchangeId: number) {
  return api<AdminExchangePayout>(
    `/settlements/admin/exchanges/${exchangeId}/payouts/retry`,
    { method: 'POST' },
  )
}

/**
 * 송금이 확정 실패한(FAILED) 환전을 최종 실패로 끝내고 보류한 수익 HP를 신청자에게 돌려준 뒤 환전을 준다.
 * 그 밖의 상태는 409 EXCHANGE_PAYOUT_NOT_FINALIZABLE, 사유가 형식에 맞지 않으면 400 EXCHANGE_FINAL_FAILURE_REASON_INVALID.
 */
export function failExchangePayoutFinally(exchangeId: number, reason: string) {
  return api<AdminExchange>(
    `/settlements/admin/exchanges/${exchangeId}/payouts/final-failure`,
    { method: 'POST', body: { reason } },
  )
}
