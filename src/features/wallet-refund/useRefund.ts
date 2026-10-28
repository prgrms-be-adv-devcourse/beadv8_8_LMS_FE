import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  cancelRefund,
  refundKeys,
  refundQuery,
  requestRefund,
  walletKeys,
} from '@/entities/wallet/api'
import {
  REFUND_POLL_INTERVAL_MS,
  REFUND_POLL_MAX,
  isRefundPending,
} from '@/entities/wallet/refund'
import type { Refund } from '@/entities/wallet/types'
import { isApiError } from '@/shared/api/ApiError'

/**
 * 환불 신청 한 건.
 * - 멱등키는 처음 제출할 때 만든다. 응답을 받지 못했으면(네트워크 오류·5xx) 같은 키로 다시 보내야 하므로 유지하고,
 *   BE가 거절을 확정했으면(4xx·503 REFUND_UNAVAILABLE) 버려 다음 제출은 새 신청이 된다. 모달을 닫으면 훅과 함께 사라진다.
 * - 신청 응답 뒤에는(성공·실패 모두) 보류·반환으로 잔액이 바뀌었을 수 있어 지갑 전체를 다시 불러온다.
 *   무효화는 훅의 onSettled에 둬서 응답 전에 모달을 닫아도 실행된다.
 * - 접수(REQUESTED)·처리 중(PROCESSING)이면 정해진 간격·횟수만큼 다시 조회하고, 그 뒤는 수동 새로고침에 맡긴다.
 *   결과가 정해지면 지갑을 다시 불러온다.
 */
export function useRefund() {
  const queryClient = useQueryClient()
  const key = useRef<string | null>(null)

  const request = useMutation({
    mutationFn: (amount: number) => {
      key.current ??= crypto.randomUUID()
      return requestRefund(amount, key.current)
    },
    onSuccess: (refund) => keep(queryClient, refund),
    onError: (error) => {
      if (isSettledRejection(error)) key.current = null
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
  })

  const refundId = request.data?.refundRequestId ?? null

  // 결제 취소를 시작하기 전(REQUESTED)에만 받아 준다. 이미 시작했으면(409) 최신 상태를 다시 본다.
  const cancel = useMutation({
    mutationFn: (id: number) => cancelRefund(id),
    onSuccess: async (refund) => {
      // 취소를 보낼 때 나가 있던 상태 조회가 늦게 와서 취소 결과를 덮어쓰지 않게 먼저 멈춘다.
      await queryClient.cancelQueries({
        queryKey: refundKeys.detail(refund.refundRequestId),
      })
      keep(queryClient, refund)
    },
    onError: (error, id) => {
      if (isApiError(error, 'REFUND_NOT_CANCELABLE'))
        return queryClient.invalidateQueries({
          queryKey: refundKeys.detail(id),
        })
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: walletKeys.all }),
  })
  const detail = refundQuery(refundId ?? 0)
  const current = useQuery({
    ...detail,
    queryFn: async (context) => {
      const refund = await detail.queryFn!(context)
      if (!isRefundPending(refund.status))
        await queryClient.invalidateQueries({ queryKey: walletKeys.all })
      return refund
    },
    // 신청 응답을 캐시에 넣어 두고(keep) 그 뒤로는 간격마다만 조회한다.
    enabled: refundId !== null,
    staleTime: Infinity,
    refetchInterval: (query) => {
      const refund = query.state.data
      return refund &&
        isRefundPending(refund.status) &&
        !query.state.error &&
        query.state.dataUpdateCount <= REFUND_POLL_MAX
        ? REFUND_POLL_INTERVAL_MS
        : false
    },
  })

  const refund = current.data ?? request.data ?? null
  const pending = refund !== null && isRefundPending(refund.status)
  // 신청 응답(1) + 조회 횟수. dataUpdatedAt을 읽어 같은 응답이 와도 다시 그린다.
  const updates = current.dataUpdatedAt
    ? (queryClient.getQueryState(detail.queryKey)?.dataUpdateCount ?? 0)
    : 0
  const notFound = isApiError(current.error, 'REFUND_NOT_FOUND')
  const error = request.error
  return {
    refund,
    submitting: request.isPending,
    /** 응답을 받지 못했다. 같은 금액·같은 키로 다시 시도해야 한다. */
    unknown: error !== null && !isSettledRejection(error),
    /** BE가 확정한 거절 */
    rejection: error !== null && isSettledRejection(error) ? error : null,
    /** 이번 신청을 BE가 찾지 못했다(조회를 멈춘다). */
    notFound,
    /** 정해진 횟수만큼 확인해도 아직 처리 중이거나, 조회에 실패했다. 수동 새로고침에 맡긴다. */
    delayed:
      pending &&
      !notFound &&
      (updates > REFUND_POLL_MAX || current.error !== null),
    refreshing: current.isFetching,
    canceling: cancel.isPending,
    cancelError: cancel.error,
    submit: (amount: number) => request.mutate(amount),
    cancel: () => {
      if (refundId !== null) cancel.mutate(refundId)
    },
    refresh: () => void current.refetch(),
  }
}

/** 신청·취소 응답을 조회 캐시에 넣는다(다음 조회까지 이 값을 보여 준다). */
function keep(queryClient: ReturnType<typeof useQueryClient>, refund: Refund) {
  queryClient.setQueryData(refundKeys.detail(refund.refundRequestId), refund)
}

/**
 * BE가 신청을 받지 않았다고 확정한 거절인지. 4xx는 접수 전 검사에서 막은 것이고,
 * 503 REFUND_UNAVAILABLE은 결제 설정이 없어 접수 전에 거절한 것이다.
 * 그 밖의 5xx·네트워크 오류는 접수됐는데 응답만 놓쳤을 수 있다.
 */
function isSettledRejection(error: Error): boolean {
  return (
    isApiError(error) &&
    (error.status < 500 || error.code === 'REFUND_UNAVAILABLE')
  )
}
