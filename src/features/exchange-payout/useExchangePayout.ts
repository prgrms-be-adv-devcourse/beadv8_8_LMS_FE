import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
  type MutationKey,
} from '@tanstack/react-query'
import {
  adminExchangeKeys,
  failExchangePayoutFinally,
  recheckExchangePayout,
  retryExchangePayout,
} from '@/entities/wallet/adminExchangeApi'
import { platformWalletKeys } from '@/entities/wallet/platformWalletApi'
import type {
  AdminExchangePayout,
  ExchangePayoutStatus,
} from '@/entities/wallet/types'
import {
  fallbackActionMessage,
  isGlobalAuthError,
  useMountedRef,
} from '@/features/admin-flow/actionError'
import { isApiError } from '@/shared/api/ApiError'
import { lookup } from '@/shared/lib/statusLabel'
import { toast } from '@/shared/ui/toastStore'

/** 결과 재확인 뒤 시도 상태별 안내. 여전히 모르면 BE는 상태를 그대로 두고 200을 준다 */
const RECHECK_RESULT: Partial<Record<ExchangePayoutStatus, string>> = {
  COMPLETED: '송금이 성공했어요. 환전을 마쳤어요.',
  FAILED:
    '은행이 송금 실패를 확정했어요. 다시 송금하거나 최종 실패로 끝낼 수 있어요.',
  PROCESSING: '아직 결과를 몰라요. 상태는 그대로예요.',
  UNKNOWN: '아직 결과를 몰라요. 상태는 그대로예요.',
  MANUAL_REVIEW_REQUIRED: '아직 결과를 몰라요. 운영자 확인 상태 그대로예요.',
}

/** 재송금한 새 시도의 상태별 안내 */
const RETRY_RESULT: Partial<Record<ExchangePayoutStatus, string>> = {
  COMPLETED: '다시 송금했고 성공했어요. 환전을 마쳤어요.',
  FAILED: '다시 송금했지만 은행이 실패를 확정했어요.',
  PROCESSING: '다시 송금했어요. 결과는 자동으로 확인해요.',
  UNKNOWN: '다시 송금했지만 결과를 몰라요. 결과는 자동으로 확인해요.',
  MANUAL_REVIEW_REQUIRED: '다시 송금했지만 운영자 확인이 필요해요.',
}

const resultMessage = (
  table: Partial<Record<ExchangePayoutStatus, string>>,
  attempt: AdminExchangePayout,
) =>
  lookup(table, attempt.status) ??
  '송금 시도를 처리했어요. 시도 이력에서 상태를 확인하세요.'

/** 재송금한 새 시도의 결과 문구. 송금 패널에 남긴다 */
export const retryResultMessage = (attempt: AdminExchangePayout) =>
  resultMessage(RETRY_RESULT, attempt)

/** 최종 실패 사유 형식 오류. 토스트 대신 모달 입력칸 아래에 보여 준다 */
export function isFinalFailureReasonError(error: Error | null) {
  return (
    isApiError(error, 'EXCHANGE_FINAL_FAILURE_REASON_INVALID') ||
    isApiError(error, 'INVALID_REQUEST')
  )
}

/** 다시 보내도 같은 결과인 오류(송금 상태가 바뀜·없음). 상세를 다시 불러오면 처리 버튼이 바뀌므로 확인 창을 닫는다 */
export function isFinalPayoutError(error: Error) {
  return (
    isApiError(error, 'EXCHANGE_PAYOUT_NOT_CHECKABLE') ||
    isApiError(error, 'EXCHANGE_PAYOUT_NOT_RETRYABLE') ||
    isApiError(error, 'EXCHANGE_PAYOUT_NOT_FINALIZABLE') ||
    isApiError(error, 'EXCHANGE_NOT_FOUND')
  )
}

/**
 * 확인 창 안에 남길 실패 문구. 전역 안내·창을 닫는 오류면 null.
 * 사유 칸이 있는 창(최종 실패)만 사유 형식 오류(400)를 칸 아래에 보이므로 뺀다. 사유 칸이 없는 창(재송금)은 400도 창 안에 남긴다.
 */
export function payoutFailureMessage(
  error: Error | null,
  { reasonField = false }: { reasonField?: boolean } = {},
) {
  if (
    !error ||
    isGlobalAuthError(error) ||
    (reasonField && isFinalFailureReasonError(error)) ||
    isFinalPayoutError(error)
  )
    return null
  return errorMessage(error)
}

function errorMessage(error: Error) {
  if (isApiError(error, 'EXCHANGE_PAYOUT_NOT_CHECKABLE'))
    return '결과를 다시 확인할 송금 시도가 없어요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'EXCHANGE_PAYOUT_NOT_RETRYABLE'))
    return '송금이 확정 실패한 환전만 다시 송금할 수 있어요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'EXCHANGE_PAYOUT_NOT_FINALIZABLE'))
    return '송금 실패가 확정된 환전만 최종 실패로 끝낼 수 있어요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'EXCHANGE_PAYOUT_UNAVAILABLE'))
    return '지금은 송금을 처리할 수 없어요. 잠시 뒤 다시 시도해 주세요.'
  if (isApiError(error, 'EXCHANGE_NOT_FOUND'))
    return '환전 신청을 찾을 수 없어요.'
  return fallbackActionMessage(error)
}

/**
 * 재확인·재송금·최종 실패 공통: 결과를 안내하고, 처리하면(실패해도) 관리자 환전 조회 전체와 수수료 수입을 다시 불러온다.
 * 환전 상세·목록·송금 시도·대시보드 건수가 같은 키 아래에 있고, 송금이 성공하면 수수료 수입이 쌓인다.
 * 다른 관리자의 처리나 자동 결과 확인과 겹쳤을 수 있다(409). 401·403 안내는 queryClient의 MutationCache가 맡는다.
 * 확인 창이 있는 처리(inline)는 실패를 창 안에 남기고(payoutFailureMessage), 창을 닫는 오류이거나 응답 전에 창을 닫았으면 토스트로 알린다.
 */
function usePayoutMutation<T, R>(
  mutationKey: MutationKey,
  mutationFn: (variables: T) => Promise<R>,
  onSuccess: (result: R) => void,
  { inline }: { inline: boolean },
) {
  const queryClient = useQueryClient()
  const mounted = useMountedRef()
  return useMutation({
    mutationKey,
    mutationFn,
    onSuccess,
    onError: (error) => {
      if (isGlobalAuthError(error)) return
      if (inline && mounted.current && !isFinalPayoutError(error)) return
      toast(errorMessage(error), { tone: 'error' })
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminExchangeKeys.all }),
        queryClient.invalidateQueries({ queryKey: platformWalletKeys.all }),
      ]),
  })
}

/** 결과 재확인. 은행에 조회만 하므로 확인 창을 두지 않는다 */
export function useRecheckPayout(exchangeId: number) {
  return usePayoutMutation<void, AdminExchangePayout>(
    adminExchangeKeys.payout(exchangeId),
    () => recheckExchangePayout(exchangeId),
    (attempt) => toast(resultMessage(RECHECK_RESULT, attempt)),
    { inline: false },
  )
}

/**
 * 수동 재송금. 새 지급 요청 ID로 보내므로 확인 창을 거친다.
 * 결과(새 시도의 상태)는 토스트 대신 송금 패널에 남긴다(useLastRetryResult).
 */
export function useRetryPayout(exchangeId: number) {
  return usePayoutMutation<void, AdminExchangePayout>(
    adminExchangeKeys.payoutRetry(exchangeId),
    () => retryExchangePayout(exchangeId),
    () => {},
    { inline: true },
  )
}

/** 이 환전에서 마지막으로 성공한 재송금의 새 시도. 확인 창을 닫거나 버튼이 사라져도 패널이 결과를 보여 준다 */
export function useLastRetryResult(exchangeId: number) {
  const results = useMutationState({
    filters: {
      mutationKey: adminExchangeKeys.payoutRetry(exchangeId),
      status: 'success',
    },
    select: (mutation) => mutation.state.data as AdminExchangePayout,
  })
  return results.at(-1) ?? null
}

/** 최종 실패 확정. 응답(환전)으로 상세를 바로 바꾼다 */
export function useFailPayoutFinally(exchangeId: number) {
  const queryClient = useQueryClient()
  return usePayoutMutation(
    adminExchangeKeys.payout(exchangeId),
    (reason: string) => failExchangePayoutFinally(exchangeId, reason),
    (exchange) => {
      queryClient.setQueryData(adminExchangeKeys.detail(exchangeId), exchange)
      toast('최종 실패로 끝냈어요. 보류한 수익 HP는 신청자에게 돌아가요.')
    },
    { inline: true },
  )
}

/**
 * 이 환전의 송금 처리가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 봐서
 * 모달을 닫았다 열거나 다른 메뉴에 다녀와도 이전 요청이 끝날 때까지 다시 보내지 못한다.
 */
export function usePayoutBusy(exchangeId: number) {
  return (
    useIsMutating({ mutationKey: adminExchangeKeys.payout(exchangeId) }) > 0
  )
}
