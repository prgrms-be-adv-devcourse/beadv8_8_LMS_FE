import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { requestExchange, walletKeys } from '@/entities/wallet/api'
import type { ExchangeRequest } from '@/entities/wallet/types'
import { isApiError } from '@/shared/api/ApiError'

/**
 * 환전 신청 한 건.
 * - 멱등키는 처음 제출할 때 만든다. 응답을 받지 못했으면(네트워크 오류·5xx) 같은 키로 다시 보내야 하므로 유지하고,
 *   BE가 거절을 확정했으면(4xx·503 EXCHANGE_UNAVAILABLE) 버려 다음 제출은 새 신청이 된다.
 *   reset(새로 신청)이나 화면을 떠났다 오면 새 키를 쓴다.
 * - 신청 응답 뒤에는(성공·실패 모두) 보류로 잔액이 바뀌었을 수 있어 지갑·환전 내역을 다시 불러온다.
 *   무효화는 훅의 onSettled에 둬서 응답 전에 화면을 떠나도 실행된다. onSettled가 무효화 Promise를 돌려주므로
 *   지갑을 다시 불러온 뒤에야 결과(exchange)가 보이고, 그래서 "새로 신청"의 처음 금액·검사는 줄어든 수익 HP 기준이다.
 */
export function useRequestExchange() {
  const queryClient = useQueryClient()
  const key = useRef<string | null>(null)

  const request = useMutation({
    mutationFn: (body: ExchangeRequest) => {
      key.current ??= crypto.randomUUID()
      return requestExchange(body, key.current)
    },
    onSuccess: (exchange) =>
      queryClient.setQueryData(
        walletKeys.exchange(exchange.exchangeId),
        exchange,
      ),
    onError: (error) => {
      if (isSettledRejection(error)) key.current = null
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
  })

  const error = request.error
  return {
    /** 서버가 확정한 신청 결과 */
    exchange: request.data ?? null,
    submitting: request.isPending,
    /** 응답을 받지 못했다. 같은 내용·같은 키로 다시 시도해야 한다. */
    unknown: error !== null && !isSettledRejection(error),
    /** BE가 확정한 거절 */
    rejection: error !== null && isSettledRejection(error) ? error : null,
    submit: (body: ExchangeRequest) => request.mutate(body),
    /** 새로 신청: 결과를 지우고 다음 제출에 새 멱등키를 쓴다. */
    reset: () => {
      key.current = null
      request.reset()
    },
  }
}

/**
 * BE가 신청을 받지 않았다고 확정한 거절인지. 4xx는 접수 전 검사에서 막은 것이고,
 * 503 EXCHANGE_UNAVAILABLE은 암호화 설정이 없어 접수 전에 거절한 것이다.
 * 그 밖의 5xx·네트워크 오류는 접수됐는데 응답만 놓쳤을 수 있다.
 */
function isSettledRejection(error: Error): boolean {
  return (
    isApiError(error) &&
    (error.status < 500 || error.code === 'EXCHANGE_UNAVAILABLE')
  )
}
