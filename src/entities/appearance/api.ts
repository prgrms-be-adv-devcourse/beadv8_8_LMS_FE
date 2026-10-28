import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  Appearance,
  AppearanceRole,
  AppearanceSummary,
  Application,
  HostCancelInput,
  AppearanceRequest,
  AppearanceRequestEdit,
  AppearanceRequestInput,
  AppearanceRequestSummary,
  Recruit,
  RecruitEdit,
  RecruitInput,
  RecruitListTab,
  RecruitSummary,
  RequestSide,
} from './types'

/**
 * 보낸 요청서·모집글의 HP 보류 결과를 기다리는 중임을 목록 화면에 알리는 URL 파라미터. 값은 보낸 시각(ms)이다.
 * BE는 보류가 끝나지 않은 글을 목록·상세에서 숨기고 ID도 주지 않아(503 BILLING_UNAVAILABLE),
 * 개별 글을 추적하지 못하고 목록을 잠시 다시 불러오는 것으로 대신한다(BE #306 전까지).
 */
export const HOLD_PENDING_PARAM = 'holdPending'

/** 보류 결과를 기다리는 목록 주소. sentAt은 요청을 보내기 직전의 브라우저 시각(ms) */
export const holdPendingPath = (path: string, sentAt: number) =>
  `${path}&${HOLD_PENDING_PARAM}=${sentAt}`

export const appearanceKeys = {
  all: ['appearance'] as const,
  requests: (side: RequestSide, page: number) =>
    [...appearanceKeys.all, 'requests', side, page] as const,
  request: (requestId: number) =>
    [...appearanceKeys.all, 'request', requestId] as const,
  recruits: (tab: RecruitListTab, page: number) =>
    [...appearanceKeys.all, 'recruits', tab, page] as const,
  recruit: (recruitId: number) =>
    [...appearanceKeys.all, 'recruit', recruitId] as const,
  recruitApplications: (recruitId: number, page: number) =>
    [
      ...appearanceKeys.all,
      'recruit',
      recruitId,
      'applications',
      page,
    ] as const,
  myApplications: (page: number) =>
    [...appearanceKeys.all, 'applications', 'mine', page] as const,
  appearances: (role: AppearanceRole, page: number) =>
    [...appearanceKeys.all, 'appearances', role, page] as const,
  appearance: (appearanceId: number) =>
    [...appearanceKeys.all, 'appearance', appearanceId] as const,
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

/** 출연 요청 보내기. 출연료만큼 HP를 보류한 뒤 응답한다(잔액 부족이면 INSUFFICIENT_BALANCE). */
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

/** 모집 중(open, 마감 전만) / 내가 올린 모집글(mine). 최신순 고정 */
export const recruitsQuery = (tab: RecruitListTab, page: number) =>
  queryOptions({
    queryKey: appearanceKeys.recruits(tab, page),
    queryFn: () =>
      api<PagedModel<RecruitSummary>>(
        tab === 'mine' ? '/appearances/recruits/mine' : '/appearances/recruits',
        { query: { page, size: 10 } },
      ),
    // 같은 탭의 페이지를 넘길 때만 이전 목록을 유지한다(다른 탭 목록을 잠깐이라도 보여 주지 않는다).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === tab ? previous : undefined,
  })

export const recruitQuery = (recruitId: number) =>
  queryOptions({
    queryKey: appearanceKeys.recruit(recruitId),
    queryFn: () => api<Recruit>(`/appearances/recruits/${recruitId}`),
  })

/** 모집글의 지원자 목록 (호스트만). 최신순 고정 */
export const recruitApplicationsQuery = (recruitId: number, page: number) =>
  queryOptions({
    queryKey: appearanceKeys.recruitApplications(recruitId, page),
    queryFn: () =>
      api<PagedModel<Application>>(
        `/appearances/recruits/${recruitId}/applications`,
        { query: { page, size: 20 } },
      ),
    placeholderData: keepPreviousData,
  })

/** 내 지원 목록 (게스트). 최신순 고정 */
export const myApplicationsQuery = (page: number) =>
  queryOptions({
    queryKey: appearanceKeys.myApplications(page),
    queryFn: () =>
      api<PagedModel<Application>>('/appearances/applications/mine', {
        query: { page, size: 10 },
      }),
    placeholderData: keepPreviousData,
  })

/** 모집글 올리기. 1인 출연료 × 모집 인원만큼 HP를 보류한 뒤 RECRUITING으로 응답한다 */
export function createRecruit(input: RecruitInput) {
  return api<Recruit>('/appearances/recruits', { method: 'POST', body: input })
}

/** 모집 중·마감 전 모집글의 제목·콘텐츠 설명·채널 주소 수정 (호스트) */
export function updateRecruit(recruitId: number, edit: RecruitEdit) {
  return api<Recruit>(`/appearances/recruits/${recruitId}`, {
    method: 'PATCH',
    body: edit,
  })
}

/** 조기 마감 (호스트). 대기 중인 지원은 미선정이 되고 채우지 못한 자리의 출연료를 돌려받는다 */
export function closeRecruit(recruitId: number) {
  return api<Recruit>(`/appearances/recruits/${recruitId}/close`, {
    method: 'POST',
  })
}

/** 지원 (게스트). 메시지는 선택 */
export function applyRecruit(recruitId: number, message: string) {
  return api<Application>(`/appearances/recruits/${recruitId}/applications`, {
    method: 'POST',
    body: { message: message || null },
  })
}

/** 지원 취소 (게스트). 응답 전(APPLIED)까지만, 취소하면 다시 지원할 수 없다 */
export function withdrawApplication(applicationId: number) {
  return api<Application>(
    `/appearances/applications/${applicationId}/withdraw`,
    { method: 'POST' },
  )
}

/** 지원 수락 (호스트). 바로 출연이 성립한다 */
export function acceptApplication(applicationId: number) {
  return api<Application>(`/appearances/applications/${applicationId}/accept`, {
    method: 'POST',
  })
}

/** 지원 거절 (호스트). 사유 없음 */
export function rejectApplication(applicationId: number) {
  return api<Application>(`/appearances/applications/${applicationId}/reject`, {
    method: 'POST',
  })
}

// ── 출연(성립 건) ──

/** 내 출연 (호스트로 / 게스트로). 최신순 고정 */
export const appearancesQuery = (role: AppearanceRole, page: number) =>
  queryOptions({
    queryKey: appearanceKeys.appearances(role, page),
    queryFn: () =>
      api<PagedModel<AppearanceSummary>>('/appearances', {
        query: { role, page, size: 10 },
      }),
    // 같은 역할의 페이지를 넘길 때만 이전 목록을 유지한다(역할이 바뀌면 상대가 뒤바뀐 목록을 보여 주지 않게).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === role ? previous : undefined,
  })

/** 출연 상세 (호스트·게스트만, 그 외 404 APPEARANCE_NOT_FOUND). 취소 요청 이력 포함 */
export const appearanceQuery = (appearanceId: number) =>
  queryOptions({
    queryKey: appearanceKeys.appearance(appearanceId),
    queryFn: () => api<Appearance>(`/appearances/${appearanceId}`),
  })

/** 출연 취소 요청 (게스트). 사유 필수, 방송 예정 일시 전까지, 출연 1건당 2번까지 */
export function requestAppearanceCancel(appearanceId: number, reason: string) {
  return api<Appearance>(`/appearances/${appearanceId}/cancel-requests`, {
    method: 'POST',
    body: { reason },
  })
}

/** 출연 취소 요청 수락 (호스트). 합의 취소(위약금 없음) */
export function acceptAppearanceCancel(appearanceId: number) {
  return api<Appearance>(
    `/appearances/${appearanceId}/cancel-requests/accept`,
    { method: 'POST' },
  )
}

/** 출연 취소 요청 거절 (호스트). 사유 선택. 출연은 유지되고 게스트는 1번 더 요청할 수 있다 */
export function rejectAppearanceCancel(appearanceId: number, reason?: string) {
  return api<Appearance>(
    `/appearances/${appearanceId}/cancel-requests/reject`,
    { method: 'POST', body: { reason: reason || null } },
  )
}

/** 호스트 일방 취소. 게스트에게 위약금(출연료 30%)을 지급하고 나머지는 호스트에게 반환한다 */
export function hostCancelAppearance(
  appearanceId: number,
  input: HostCancelInput,
) {
  return api<Appearance>(`/appearances/${appearanceId}/host-cancel`, {
    method: 'POST',
    body: { reason: input.reason || null, ...confirmBody(input) },
  })
}

/** 모집 전체 취소 (호스트). 성립한 출연은 출연마다 일방 취소(위약금), 대기 지원은 미선정 */
export function cancelRecruit(recruitId: number, input: HostCancelInput) {
  return api<Recruit>(`/appearances/recruits/${recruitId}/cancel`, {
    method: 'POST',
    body: { reason: input.reason || null, ...confirmBody(input) },
  })
}

const confirmBody = ({ confirmPendingCancelRequest }: HostCancelInput) =>
  confirmPendingCancelRequest ? { confirmPendingCancelRequest: true } : {}

/** 출연 확인 (호스트). 방송 예정 일시부터 7일 안에 한 번, 게스트에게 출연료를 지급한다(진행은 hpPayoutStatus) */
export function confirmAppearance(appearanceId: number) {
  return api<Appearance>(`/appearances/${appearanceId}/confirm`, {
    method: 'POST',
  })
}

/** 불참 (호스트). 사유 선택, 기간은 출연 확인과 같고 출연료를 호스트에게 돌려준다(진행은 hpReleaseStatus) */
export function markAppearanceAbsent(appearanceId: number, reason?: string) {
  return api<Appearance>(`/appearances/${appearanceId}/absent`, {
    method: 'POST',
    body: { reason: reason || null },
  })
}
