import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Wallet } from './types'

export const walletKeys = {
  /** HP가 움직이는 mutation(결제·취소·충전·환불·환전)은 이 키 전체를 무효화한다. */
  all: ['wallet'] as const,
  me: () => [...walletKeys.all, 'me'] as const,
}

export const walletQuery = queryOptions({
  queryKey: walletKeys.me(),
  queryFn: () => api<Wallet>('/wallets/me'),
})
