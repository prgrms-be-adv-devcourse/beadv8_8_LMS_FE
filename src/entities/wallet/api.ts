import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { ChargeOrder, Wallet } from './types'

export const walletKeys = {
  /** HP가 움직이는 mutation(결제·취소·충전·환불·환전)은 이 키 전체를 무효화한다. */
  all: ['wallet'] as const,
  me: () => [...walletKeys.all, 'me'] as const,
  charge: (orderId: string) => [...walletKeys.all, 'charge', orderId] as const,
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
