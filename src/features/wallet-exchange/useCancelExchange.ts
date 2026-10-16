import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cancelExchange, walletKeys } from '@/entities/wallet/api'

/**
 * 관리자 승인 전(REQUESTED)인 환전 신청 취소. 보류한 수익 HP를 모두 돌려받는다.
 * 성공하면 응답을 상세 캐시에 넣고, 결과와 상관없이(409 EXCHANGE_NOT_CANCELABLE 포함) 지갑·환전 목록·상세를 다시 불러온다.
 */
export function useCancelExchange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (exchangeId: number) => cancelExchange(exchangeId),
    onSuccess: async (exchange) => {
      const key = walletKeys.exchange(exchange.exchangeId)
      // 취소를 보낼 때 나가 있던 상세 조회가 늦게 와서 취소 결과를 덮어쓰지 않게 먼저 멈춘다.
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData(key, exchange)
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
  })
}
