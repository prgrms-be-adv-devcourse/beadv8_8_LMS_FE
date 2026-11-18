import { http, HttpResponse, type AnyHandler } from 'msw'
import type { PromotionFunding, PromotionWallet } from '@/entities/wallet/types'
import type { RsData } from '@/shared/api/types'

/**
 * 테스트 전용: 관리자 프로모션 지갑 잔액·충전을 BE처럼 흉내 내는 MSW 핸들러(BE PromotionWalletAdminFacade).
 * 같은 충전 작업 ID의 재요청은 새로 충전하지 않고 처음 결과를 replayed=true로 돌려준다.
 */
type FundingBody = {
  fundingWorkId: string
  amountHp: number
  sourceType: string
  sourceRef: string
  memo?: string
}

export const promotionWalletDb = {
  wallet: { walletId: 2, availableHp: 0, reservedHp: 0, heldHp: 0 },
  fundings: [] as FundingBody[],
} as { wallet: PromotionWallet; fundings: FundingBody[] }

export function resetPromotionWalletDb(patch: Partial<PromotionWallet> = {}) {
  promotionWalletDb.wallet = {
    walletId: 2,
    availableHp: 0,
    reservedHp: 0,
    heldHp: 0,
    ...patch,
  }
  promotionWalletDb.fundings = []
}

const json = <T>(data: T, status = 200) =>
  HttpResponse.json<RsData<T>>(
    { statusCode: status, message: 'mock', data },
    { status },
  )

export const promotionWalletHandlers: AnyHandler[] = [
  http.get('*/api/v1/settlements/admin/promotion-wallet', () =>
    json(promotionWalletDb.wallet),
  ),
  http.post(
    '*/api/v1/settlements/admin/promotion-wallet/fundings',
    async ({ request }) => {
      const body = (await request.json()) as FundingBody
      const first = promotionWalletDb.fundings.find(
        (x) => x.fundingWorkId === body.fundingWorkId,
      )
      if (!first) {
        promotionWalletDb.fundings.push(body)
        promotionWalletDb.wallet.availableHp += body.amountHp
      }
      return json<PromotionFunding>(
        {
          fundingWorkId: body.fundingWorkId,
          amountHp: (first ?? body).amountHp,
          availableHp: promotionWalletDb.wallet.availableHp,
          replayed: Boolean(first),
        },
        201,
      )
    },
  ),
]
