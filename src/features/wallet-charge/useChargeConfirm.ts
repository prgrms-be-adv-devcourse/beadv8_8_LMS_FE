import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
  chargeOrderQuery,
  confirmCharge,
  walletKeys,
  type ChargeConfirmRequest,
} from '@/entities/wallet/api'
import {
  CHARGE_POLL_INTERVAL_MS,
  CHARGE_POLL_MAX,
} from '@/entities/wallet/charge'
import type { ChargeOrder } from '@/entities/wallet/types'
import { isApiError } from '@/shared/api/ApiError'

export type ChargeFailure = {
  code: string | null
  /** PG 오류 코드 (승인 거절일 때) */
  pgCode: string | null
  message: string
}

export type ChargeConfirmState =
  | { phase: 'confirming' }
  | { phase: 'completed'; order: ChargeOrder }
  /** 정해진 횟수만큼 확인해도 PROCESSING. 결과는 BE가 나중에 확정한다. */
  | { phase: 'delayed' }
  | { phase: 'failed'; failure: ChargeFailure }

/**
 * 결제창 성공 리다이렉트 뒤 승인을 요청하고 결과를 기다린다.
 * 승인 요청은 화면당 한 번만 보낸다(같은 결제를 다시 보내도 BE가 처음 결과를 돌려주지만, StrictMode 이중 실행을 막는다).
 * 202 PROCESSING이면 주문 상태를 정해진 간격·횟수만큼 다시 본다. 충전되면 지갑(헤더 HP 포함)을 다시 불러온다.
 */
export function useChargeConfirm(
  request: ChargeConfirmRequest,
): ChargeConfirmState {
  const queryClient = useQueryClient()
  const { mutate, data, error } = useMutation({
    mutationKey: [...walletKeys.charge(request.orderId), 'confirm'],
    mutationFn: () => confirmCharge(request),
    onSuccess: (order) => {
      if (order.status === 'COMPLETED')
        return queryClient.invalidateQueries({ queryKey: walletKeys.me() })
    },
  })

  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    mutate()
  }, [mutate])

  const orderQuery = chargeOrderQuery(request.orderId)
  const poll = useQuery({
    ...orderQuery,
    queryFn: async (context) => {
      const order = await orderQuery.queryFn!(context)
      // 이 조회 자신을 취소하지 않게 지갑 잔액만 다시 부른다.
      if (order.status === 'COMPLETED')
        await queryClient.invalidateQueries({ queryKey: walletKeys.me() })
      return order
    },
    enabled: data?.status === 'PROCESSING',
    refetchInterval: (query) =>
      query.state.data?.status === 'PROCESSING' &&
      query.state.dataUpdateCount < CHARGE_POLL_MAX
        ? CHARGE_POLL_INTERVAL_MS
        : false,
  })

  if (error) return { phase: 'failed', failure: failureOf(error) }
  if (!data) return { phase: 'confirming' }
  if (data.status !== 'PROCESSING') return stateOf(data)

  if (poll.data && poll.data.status !== 'PROCESSING') return stateOf(poll.data)
  // dataUpdatedAt을 읽어 같은 응답이 와도 다시 그린다(횟수는 쿼리 상태에만 있다).
  const polls = poll.dataUpdatedAt
    ? (queryClient.getQueryState(orderQuery.queryKey)?.dataUpdateCount ?? 0)
    : 0
  if (poll.error || polls >= CHARGE_POLL_MAX) return { phase: 'delayed' }
  return { phase: 'confirming' }
}

function stateOf(order: ChargeOrder): ChargeConfirmState {
  if (order.status === 'FAILED')
    return { phase: 'failed', failure: reasonFailure(order.failureReason) }
  if (order.status === 'PENDING' || order.status === 'PROCESSING')
    return { phase: 'confirming' }
  return { phase: 'completed', order }
}

function failureOf(error: Error): ChargeFailure {
  if (isApiError(error))
    return {
      code: error.code,
      pgCode: error.body?.pgCode ?? null,
      message: error.message,
    }
  return { code: null, pgCode: null, message: error.message }
}

/** BE 실패 사유 "CODE: message"를 나눈다. */
function reasonFailure(reason: string | null): ChargeFailure {
  if (!reason)
    return { code: null, pgCode: null, message: '결제가 승인되지 않았어요.' }
  const at = reason.indexOf(': ')
  if (at < 0) return { code: reason, pgCode: null, message: '' }
  return {
    code: reason.slice(0, at),
    pgCode: null,
    message: reason.slice(at + 2),
  }
}
