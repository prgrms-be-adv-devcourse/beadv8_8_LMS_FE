import { useQuery } from '@tanstack/react-query'
import { cartQuery } from '@/entities/cart/api'
import { purchasedQuery } from '@/entities/order/api'
import type { PurchasedLecture } from '@/entities/order/types'
import { meQuery } from '@/shared/auth/me'
import { MEMBER } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'

export type BuyerState = {
  /** 강의를 사고 담을 수 있는 역할(유저·인플루언서·인증된 인플루언서) */
  canBuy: boolean
  myUserId: number | undefined
  /** 볼 수 있는(보유 중인) 강의 */
  owned: Map<number, PurchasedLecture>
  inCart: Set<number>
  /** 구매 내역을 불러오는 중(보유 여부를 아직 모른다). 그동안 바로 구매를 막는다 */
  loading: boolean
}

/**
 * 강의 카드·상세에 붙는 "보유 중·장바구니·내 강의" 표시용.
 * 구매할 수 없는 역할(비회원·관리자)이면 장바구니·구매 내역을 부르지 않는다.
 */
export function useBuyerState(): BuyerState {
  const viewer = useViewer()
  const canBuy = viewer !== undefined && MEMBER.includes(viewer)
  const { data: me } = useQuery(meQuery)
  const { data: purchased, isPending: purchasedPending } = useQuery({
    ...purchasedQuery,
    enabled: canBuy,
  })
  const { data: cart } = useQuery({ ...cartQuery, enabled: canBuy })

  return {
    canBuy,
    myUserId: me?.id,
    owned: new Map(purchased?.content.map((p) => [p.lectureId, p])),
    inCart: new Set(cart?.items.map((i) => i.lectureId)),
    // 꺼진 쿼리도 isPending이라 살 수 있는 역할일 때만 본다.
    loading: canBuy && purchasedPending,
  }
}
