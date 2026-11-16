import { http, HttpResponse, type AnyHandler } from 'msw'
import type { FeeIncome, PlatformWallet } from '@/entities/wallet/types'
import type { PagedModel, RsData } from '@/shared/api/types'

/**
 * 테스트 전용: 관리자 플랫폼 지갑 잔액·수수료 수입 내역을 BE처럼 흉내 내는 MSW 핸들러(BE PlatformWalletQueryUseCase).
 * 데이터는 메모리에 두고 테스트마다 resetPlatformWalletDb()로 초기화한다. 내역은 기록 시각 최신순 고정이다.
 */
export const feeIncome = (patch: Partial<FeeIncome> = {}): FeeIncome => ({
  ledgerId: 1,
  exchangeId: 11,
  feeAmount: 1000,
  requestedAmount: 10000,
  payoutAmount: 9000,
  recordedAt: '2026-11-10T01:00:00Z',
  ...patch,
})

const sample = (): FeeIncome[] => [
  feeIncome({ ledgerId: 1, exchangeId: 11 }),
  feeIncome({
    ledgerId: 2,
    exchangeId: 12,
    feeAmount: 5000,
    requestedAmount: 50000,
    payoutAmount: 45000,
    recordedAt: '2026-11-11T02:30:00Z',
  }),
]

export const platformWalletDb = {
  wallet: { walletId: 1, feeIncomeBalance: 6000 } as PlatformWallet,
  items: sample(),
  /** 요청한 page·size·sort */
  listCalls: [] as {
    page: string | null
    size: string | null
    sort: string | null
  }[],
}

export function resetPlatformWalletDb(
  items = sample(),
  feeIncomeBalance = items.reduce((sum, x) => sum + x.feeAmount, 0),
) {
  platformWalletDb.wallet = { walletId: 1, feeIncomeBalance }
  platformWalletDb.items = items
  platformWalletDb.listCalls = []
}

const ok = <T>(data: T) =>
  HttpResponse.json<RsData<T>>({ statusCode: 200, message: 'mock', data })

export const platformWalletHandlers: AnyHandler[] = [
  http.get('*/api/v1/settlements/admin/platform-wallet', () =>
    ok(platformWalletDb.wallet),
  ),
  http.get(
    '*/api/v1/settlements/admin/platform-wallet/fee-incomes',
    ({ request }) => {
      const url = new URL(request.url)
      platformWalletDb.listCalls.push({
        page: url.searchParams.get('page'),
        size: url.searchParams.get('size'),
        sort: url.searchParams.get('sort'),
      })
      const number = Number(url.searchParams.get('page') ?? 0)
      const size = Math.min(Number(url.searchParams.get('size') ?? 20), 100)
      const items = [...platformWalletDb.items].sort((a, b) =>
        b.recordedAt.localeCompare(a.recordedAt),
      )
      return ok<PagedModel<FeeIncome>>({
        content: items.slice(number * size, number * size + size),
        page: {
          number,
          size,
          totalElements: items.length,
          totalPages: Math.ceil(items.length / size),
        },
      })
    },
  ),
]
