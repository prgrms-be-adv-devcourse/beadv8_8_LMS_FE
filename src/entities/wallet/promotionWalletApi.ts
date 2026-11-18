import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type {
  PromotionFunding,
  PromotionFundingInput,
  PromotionWallet,
} from './types'

/**
 * 관리자 프로모션 지갑 조회·충전(BE ApiV1SettlementPromotionWalletAdminController).
 * 프로모션 HP는 플랫폼 쿠폰의 플랫폼 부담분을 대는 HP이고, 쿠폰을 열 때 가용 잔액에서 예산을 예약한다.
 */
export const promotionWalletKeys = {
  all: ['admin-promotion-wallet'] as const,
  balance: () => [...promotionWalletKeys.all, 'balance'] as const,
}

/** 칸별 잔액(가용·예약·보류) */
export const promotionWalletQuery = () =>
  queryOptions({
    queryKey: promotionWalletKeys.balance(),
    queryFn: () => api<PromotionWallet>('/settlements/admin/promotion-wallet'),
  })

/** 충전. 출처는 관리자 발행(ADMIN_GRANT)만 있어 화면에서 고르지 않는다 */
export const fundPromotionWallet = (input: PromotionFundingInput) =>
  api<PromotionFunding>('/settlements/admin/promotion-wallet/fundings', {
    method: 'POST',
    body: { ...input, sourceType: 'ADMIN_GRANT' },
  })
