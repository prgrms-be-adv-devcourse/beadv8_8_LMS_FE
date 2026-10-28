import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  cancelOrderItem,
  confirmOrderItem,
  consentToPlay,
  orderKeys,
} from '@/entities/order/api'
import { walletKeys } from '@/entities/wallet/api'
import { toast } from '@/shared/ui/toastStore'

export type PurchaseRef = { orderId: number; orderItemId: number }

function useOrderItemMutation(
  mutationFn: (ref: PurchaseRef) => Promise<unknown>,
  { movesHp = false } = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onError: (error) => toast(error.message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        movesHp && queryClient.invalidateQueries({ queryKey: walletKeys.all }),
      ]),
  })
}

export const useConfirmPurchase = () => useOrderItemMutation(confirmOrderItem)
export const useConsentToPlay = () => useOrderItemMutation(consentToPlay)
/** 구매 취소는 보류 HP를 돌려받으므로 지갑도 다시 불러온다. */
export const useCancelPurchase = () =>
  useOrderItemMutation(cancelOrderItem, { movesHp: true })
