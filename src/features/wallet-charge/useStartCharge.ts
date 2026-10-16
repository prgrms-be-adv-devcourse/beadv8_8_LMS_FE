import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createChargeOrder, walletQuery } from '@/entities/wallet/api'
import { chargeReturnUrls } from '@/entities/wallet/charge'
import { isApiError } from '@/shared/api/ApiError'
import { meQuery } from '@/shared/auth/me'
import { requestCardPayment } from '@/shared/lib/tossPayments'

/**
 * 충전 주문을 만들고 토스페이먼츠 결제창을 연다. 결제 결과는 결제창이 결과 화면으로 리다이렉트해 알려 준다.
 * 결제창에서 실패·취소해도 주문은 BE에 PENDING으로 남고, 다시 결제하면 새 주문을 만든다.
 */
export function useStartCharge(clientKey: string) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery)

  return useMutation({
    mutationFn: async (amount: number) => {
      if (!me) throw new Error('로그인이 필요해요.')
      const order = await createChargeOrder(amount).catch(async (error) => {
        // 지갑은 처음 조회할 때 만들어진다. 아직 없으면 불러온 뒤 한 번 더 만든다.
        if (!isApiError(error, 'WALLET_NOT_FOUND')) throw error
        await queryClient.fetchQuery(walletQuery)
        return createChargeOrder(amount)
      })
      await requestCardPayment(clientKey, {
        // 이메일·전화번호 대신 회원 ID로 만든 고정 값을 쓴다.
        customerKey: `hapbang-member-${me.id}`,
        amount: order.amount,
        orderId: order.orderId,
        orderName: order.orderName,
        ...chargeReturnUrls(window.location.origin, order.amount),
      })
    },
  })
}
