import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  ChargeOrder,
  Exchange,
  ExchangeRequest,
  Refund,
  Wallet,
} from './types'

export const walletKeys = {
  /** HP가 움직이는 mutation(결제·취소·충전·환불·환전)은 이 키 전체를 무효화한다. */
  all: ['wallet'] as const,
  me: () => [...walletKeys.all, 'me'] as const,
  charge: (orderId: string) => [...walletKeys.all, 'charge', orderId] as const,
  /** 환전 목록·상세도 지갑 키 아래에 둬서, 신청·취소 뒤 지갑과 함께 다시 불러온다. */
  exchanges: (page: number) => [...walletKeys.all, 'exchanges', page] as const,
  exchange: (exchangeId: number) =>
    [...walletKeys.all, 'exchange', exchangeId] as const,
}

/**
 * 환불 요청 조회. walletKeys 밖에 둬서 지갑 무효화가 처리 중 조회를 따로 다시 부르지 않게 한다
 * (조회 간격·횟수는 useRefund가 정한다).
 */
export const refundKeys = {
  detail: (refundRequestId: number) =>
    ['wallet-refund', refundRequestId] as const,
}

export const walletQuery = queryOptions({
  queryKey: walletKeys.me(),
  queryFn: () => api<Wallet>('/wallets/me'),
})

/** 결제 전 충전 주문을 만든다(PENDING, HP 변화 없음). */
export function createChargeOrder(amount: number) {
  return api<ChargeOrder>('/wallets/charges', {
    method: 'POST',
    body: { amount },
  })
}

export type ChargeConfirmRequest = {
  paymentKey: string
  orderId: string
  amount: number
}

/**
 * 결제창 성공 리다이렉트 값으로 승인을 요청한다. 200 COMPLETED, 202 PROCESSING(본문 status로 구분).
 * 같은 결제를 다시 보내면 BE가 처음 결과를 돌려준다.
 */
export function confirmCharge(request: ChargeConfirmRequest) {
  return api<ChargeOrder>('/wallets/charges/confirm', {
    method: 'POST',
    body: request,
  })
}

export const chargeOrderQuery = (orderId: string) =>
  queryOptions({
    queryKey: walletKeys.charge(orderId),
    queryFn: () =>
      api<ChargeOrder>(`/wallets/charges/${encodeURIComponent(orderId)}`),
  })

/**
 * 충전 HP 환불을 신청한다. BE가 결제 건별 취소까지 처리한 결과를 돌려준다
 * (200 COMPLETED·PARTIALLY_COMPLETED·FAILED, 202 REQUESTED·PROCESSING·MANUAL_REVIEW_REQUIRED, 본문 status로 구분).
 * 같은 Idempotency-Key로 다시 보내면 처음 요청의 결과를 돌려준다(금액이 다르면 409 IDEMPOTENCY_KEY_CONFLICT).
 */
export function requestRefund(amount: number, idempotencyKey: string) {
  return api<Refund>('/wallets/refunds', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { amount },
  })
}

export const refundQuery = (refundRequestId: number) =>
  queryOptions({
    queryKey: refundKeys.detail(refundRequestId),
    queryFn: () => api<Refund>(`/wallets/refunds/${refundRequestId}`),
  })

/** 결제 취소를 시작하기 전(REQUESTED)인 환불 신청을 취소한다. 이미 시작했으면 409 REFUND_NOT_CANCELABLE. */
export function cancelRefund(refundRequestId: number) {
  return api<Refund>(`/wallets/refunds/${refundRequestId}/cancel`, {
    method: 'POST',
  })
}

export const EXCHANGE_PAGE_SIZE = 10

/** 내 환전 신청 목록(최신 신청부터) */
export const exchangesQuery = (page: number) =>
  queryOptions({
    queryKey: walletKeys.exchanges(page),
    queryFn: () =>
      api<PagedModel<Exchange>>('/settlements/exchanges', {
        query: { page, size: EXCHANGE_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  })

/** 내 환전 신청 하나(상태·수수료·신청 당시 마스킹 계좌) */
export const exchangeQuery = (exchangeId: number) =>
  queryOptions({
    queryKey: walletKeys.exchange(exchangeId),
    queryFn: () => api<Exchange>(`/settlements/exchanges/${exchangeId}`),
  })

/**
 * 수익 HP 환전을 신청한다(201 REQUESTED, 신청 금액만큼 수익 HP 보류).
 * 같은 Idempotency-Key로 다시 보내면 처음 신청의 현재 결과를 돌려준다(금액·계좌가 다르면 409 IDEMPOTENCY_KEY_CONFLICT).
 */
export function requestExchange(
  request: ExchangeRequest,
  idempotencyKey: string,
) {
  return api<Exchange>('/settlements/exchanges', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: request,
  })
}

/** 관리자 승인 전(REQUESTED)인 신청을 취소한다(보류 HP 반환). 그 뒤 단계면 409 EXCHANGE_NOT_CANCELABLE. */
export function cancelExchange(exchangeId: number) {
  return api<Exchange>(`/settlements/exchanges/${exchangeId}/cancel`, {
    method: 'POST',
  })
}
