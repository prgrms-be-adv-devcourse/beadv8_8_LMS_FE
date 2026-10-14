import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Wallet } from './types'

export const billingKeys = {
  /** HP가 움직이는 mutation은 이 키 전체를 무효화한다. */
  all: ['billing'] as const,
  wallet: () => [...billingKeys.all, 'wallet'] as const,
}

export const walletQuery = queryOptions({
  queryKey: billingKeys.wallet(),
  queryFn: () => api<Wallet>('/wallets/me'),
})
