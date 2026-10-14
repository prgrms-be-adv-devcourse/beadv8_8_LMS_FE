import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  AppearanceRequest,
  AppearanceRequestEdit,
  AppearanceRequestInput,
  AppearanceRequestSummary,
  RequestSide,
} from './types'

/**
 * 보낸 요청의 HP 보류 결과를 기다리는 중임을 목록 화면에 알리는 URL 파라미터.
 * BE는 보류가 끝나지 않은 요청서를 목록·상세에서 숨기고 요청 ID도 주지 않아(503 BILLING_UNAVAILABLE),
 * 개별 요청을 추적하지 못하고 목록을 잠시 다시 불러오는 것으로 대신한다.
 */
export const HOLD_PENDING_PARAM = 'holdPending'

export const appearanceKeys = {
  all: ['appearance'] as const,
  requests: (side: RequestSide, page: number) =>
    [...appearanceKeys.all, 'requests', side, page] as const,
  request: (requestId: number) =>
    [...appearanceKeys.all, 'request', requestId] as const,
}

/** 호스트로 보낸 요청(sent) / 게스트로 받은 요청(received). 최신순 고정 */
export const appearanceRequestsQuery = (side: RequestSide, page: number) =>
  queryOptions({
    queryKey: appearanceKeys.requests(side, page),
    queryFn: () =>
      api<PagedModel<AppearanceRequestSummary>>(
        `/appearances/requests/${side === 'host' ? 'sent' : 'received'}`,
        { query: { page, size: 10 } },
      ),
    // 같은 역할의 페이지를 넘길 때만 이전 목록을 유지한다. 역할이 바뀌면 이전 목록을 새 역할로
    // 잘못 해석해(상대·상태가 뒤바뀜) 보여 주게 되므로, 새 목록이 올 때까지 로딩으로 둔다.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === side ? previous : undefined,
  })

export const appearanceRequestQuery = (requestId: number) =>
  queryOptions({
    queryKey: appearanceKeys.request(requestId),
    queryFn: () => api<AppearanceRequest>(`/appearances/requests/${requestId}`),
  })

/** 출연 요청 보내기. 출연료만큼 HP를 보류한 뒤 응답한다(잔액 부족이면 INSUFFICIENT_HP). */
export function createAppearanceRequest(input: AppearanceRequestInput) {
  return api<AppearanceRequest>('/appearances/requests', {
    method: 'POST',
    body: input,
  })
}

/** 응답 전 요청서의 제목·내용·채널 주소 수정 (호스트) */
export function updateAppearanceRequest(
  requestId: number,
  edit: AppearanceRequestEdit,
) {
  return api<AppearanceRequest>(`/appearances/requests/${requestId}`, {
    method: 'PATCH',
    body: edit,
  })
}

/** 수락 (게스트). 화면에서 본 version을 보낸다 */
export function acceptAppearanceRequest(requestId: number, version: number) {
  return api<AppearanceRequest>(`/appearances/requests/${requestId}/accept`, {
    method: 'POST',
    body: { version },
  })
}

/** 거절 (게스트). 사유는 선택 */
export function rejectAppearanceRequest(requestId: number, reason?: string) {
  return api<AppearanceRequest>(`/appearances/requests/${requestId}/reject`, {
    method: 'POST',
    body: { reason: reason || null },
  })
}

/** 응답 전 취소 (호스트). 보류 HP를 돌려받는다 */
export function cancelAppearanceRequest(requestId: number) {
  return api<AppearanceRequest>(`/appearances/requests/${requestId}/cancel`, {
    method: 'POST',
  })
}
