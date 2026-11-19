import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  adminExchangeKeys,
  approveExchange,
  rejectExchange,
} from '@/entities/wallet/adminExchangeApi'
import type { AdminExchange } from '@/entities/wallet/types'
import {
  fallbackActionMessage,
  isGlobalAuthError,
  useMountedRef,
} from '@/features/admin-flow/actionError'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/** 거절 사유 형식 오류. 토스트 대신 모달 입력칸 아래에 보여 준다 */
export function isRejectionReasonError(error: Error | null) {
  return (
    isApiError(error, 'EXCHANGE_REJECTION_REASON_INVALID') ||
    isApiError(error, 'INVALID_REQUEST')
  )
}

/**
 * 다시 보내도 같은 결과인 오류(이미 처리·취소됨, 신청자 자격, 없음). 상세를 다시 불러오면 처리 영역이 바뀌므로
 * 확인 창을 닫고 토스트로 알린다.
 */
export function isFinalReviewError(error: Error) {
  return (
    isApiError(error, 'EXCHANGE_ALREADY_REVIEWED') ||
    isApiError(error, 'EXCHANGE_APPLICANT_NOT_SYNCED') ||
    isApiError(error, 'EXCHANGE_APPLICANT_NOT_ELIGIBLE') ||
    isApiError(error, 'EXCHANGE_NOT_FOUND')
  )
}

/** 확인 창 안에 남길 실패 문구. 사유 형식 오류(칸 아래에 보인다)·전역 안내·창을 닫는 오류면 null */
export function reviewFailureMessage(error: Error | null) {
  if (
    !error ||
    isGlobalAuthError(error) ||
    isRejectionReasonError(error) ||
    isFinalReviewError(error)
  )
    return null
  return errorMessage(error)
}

function errorMessage(error: Error) {
  if (isApiError(error, 'EXCHANGE_ALREADY_REVIEWED'))
    return '이미 처리됐거나 회원이 취소한 신청이에요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'EXCHANGE_APPLICANT_NOT_SYNCED'))
    return '신청자 회원 정보가 아직 반영되지 않아 승인할 수 없어요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'EXCHANGE_APPLICANT_NOT_ELIGIBLE'))
    return '신청자가 정상 상태의 인플루언서가 아니라 승인할 수 없어요. 최신 상태를 불러왔어요.'
  if (isApiError(error, 'EXCHANGE_NOT_FOUND'))
    return '환전 신청을 찾을 수 없어요.'
  return fallbackActionMessage(error)
}

/**
 * 승인·거절 공통: 응답으로 상세를 바로 바꾸고, 처리하면(실패해도) 관리자 환전 조회 전체를 다시 불러온다.
 * 다른 관리자 처리·회원 취소와 겹쳤을 수 있다. 목록·상세·대시보드 대기 건수가 같은 키 아래에 있다.
 * 실패는 확인 창 안에 남기고(reviewFailureMessage), 창을 닫는 오류이거나 응답 전에 창을 닫았으면 토스트로 알린다.
 * 401·403 안내는 queryClient의 MutationCache가 맡는다.
 */
function useReview<T>(
  mutationFn: (variables: T) => Promise<AdminExchange>,
  success: string,
) {
  const queryClient = useQueryClient()
  const mounted = useMountedRef()
  return useMutation({
    mutationKey: adminExchangeKeys.review(),
    mutationFn,
    onSuccess: (exchange) => {
      queryClient.setQueryData(
        adminExchangeKeys.detail(exchange.exchangeId),
        exchange,
      )
      toast(success)
    },
    onError: (error) => {
      if (isGlobalAuthError(error)) return
      if (mounted.current && !isFinalReviewError(error)) return
      toast(errorMessage(error))
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: adminExchangeKeys.all }),
  })
}

export function useApproveExchange() {
  return useReview(
    (exchangeId: number) => approveExchange(exchangeId),
    '환전 신청을 승인했어요. 송금은 정산 처리에서 해요.',
  )
}

export function useRejectExchange() {
  return useReview(
    ({ exchangeId, reason }: { exchangeId: number; reason: string }) =>
      rejectExchange(exchangeId, reason),
    '환전 신청을 거절했어요. 보류한 수익 HP는 신청자에게 돌아가요.',
  )
}

/**
 * 승인·거절이 진행 중인지. 화면 상태가 아니라 mutation 캐시로 본다. 모달을 닫았다 열거나
 * 다른 메뉴로 갔다 돌아와도 이전 요청이 끝날 때까지 다시 보내지 못한다.
 */
export function useReviewingExchange() {
  return useIsMutating({ mutationKey: adminExchangeKeys.review() }) > 0
}
