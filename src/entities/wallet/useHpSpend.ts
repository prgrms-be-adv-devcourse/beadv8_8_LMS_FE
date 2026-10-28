import { useQuery } from '@tanstack/react-query'
import { walletQuery } from './api'
import type { Wallet } from './types'

export type HpSpend = {
  amount: number
  wallet: Wallet | undefined
  error: Error | null
  retry: () => void
  retrying: boolean
  /** 지갑을 받아 잔액과 차감 구성을 보여 줄 수 있다. 그 전에는 결제·보류를 막는다. */
  ready: boolean
  /** 모자란 HP (지갑을 받기 전에는 0) */
  short: number
  /** 수익 HP에서 쓰는 몫 (미리보기) */
  fromEarn: number
  /** 충전 HP에서 쓰는 몫 (미리보기) */
  fromCharge: number
}

/**
 * HP 결제·보류 미리보기. 수익 HP를 먼저 다 쓰고 부족한 만큼 충전 HP를 쓴다(순서 변경 불가).
 * 실제 차감·보류는 서버가 하고, 여기 숫자는 보여 주기용이다.
 */
export function useHpSpend(amount: number): HpSpend {
  const { data: wallet, error, refetch, isRefetching } = useQuery(walletQuery)
  const short = wallet ? Math.max(0, amount - wallet.availableTotalHp) : 0
  const fromEarn = wallet ? Math.min(amount, wallet.revenueBalanceHp) : 0
  return {
    amount,
    wallet,
    error,
    retry: () => void refetch(),
    retrying: isRefetching,
    ready: wallet !== undefined,
    short,
    fromEarn,
    fromCharge: Math.max(0, amount - fromEarn - short),
  }
}
