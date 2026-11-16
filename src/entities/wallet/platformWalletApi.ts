import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { FeeIncome, PlatformWallet } from './types'

/**
 * 관리자 플랫폼 지갑(환전 수수료 수입) 조회. 수수료는 환전 송금이 성공할 때 BE가 기록하므로
 * 승인·거절은 바꾸지 않는다(무효화하지 않는다). 송금 처리(결과 재확인·재송금)는 성공할 수 있어 무효화한다.
 */
export const platformWalletKeys = {
  all: ['admin-platform-wallet'] as const,
  balance: () => [...platformWalletKeys.all, 'balance'] as const,
  feeIncomes: (page: number) =>
    [...platformWalletKeys.all, 'fee-incomes', page] as const,
}

export const FEE_INCOME_PAGE_SIZE = 20

/** 수수료 수입 잔액 */
export const platformWalletQuery = () =>
  queryOptions({
    queryKey: platformWalletKeys.balance(),
    queryFn: () => api<PlatformWallet>('/settlements/admin/platform-wallet'),
  })

/** 수수료 수입 내역. 기록 시각 최신순 고정이라 정렬은 보내지 않는다 */
export const feeIncomesQuery = (page: number) =>
  queryOptions({
    queryKey: platformWalletKeys.feeIncomes(page),
    queryFn: () =>
      api<PagedModel<FeeIncome>>(
        '/settlements/admin/platform-wallet/fee-incomes',
        { query: { page, size: FEE_INCOME_PAGE_SIZE } },
      ),
  })
