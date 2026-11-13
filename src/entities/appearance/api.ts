import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  Appearance,
  AppearanceReviewInput,
  AppearanceRole,
  AppearanceStatus,
  AppearanceSummary,
  Application,
  HostCancelInput,
  AppearanceRequest,
  AppearanceRequestEdit,
  AppearanceRequestInput,
  AppearanceRequestStatus,
  AppearanceRequestSummary,
  Recruit,
  RecruitEdit,
  RecruitInput,
  RecruitListTab,
  RecruitStatus,
  RecruitSummary,
  RequestSide,
} from './types'

/**
 * 내가 보낸 요청서·올린 모집글 목록의 보기(주소 `?view=`). BE는 상태를 지정하지 않으면 보류 실패(HOLD_FAILED) 글까지
 * 모두 주므로, 기본 보기는 실패 글을 뺀 상태를 status로 명시하고, '등록 실패' 보기만 실패 글을 받는다(사용자 결정 2026-11-05).
 * 받은 요청·공개 모집 목록에는 두 보류 상태가 나오지 않아 보기를 쓰지 않는다
 */
export type HoldListView = 'active' | 'failed'

/** 주소 값 → 보기. 없거나 모르는 값이면 기본(active) */
export const holdListViewOf = (value: string | null): HoldListView =>
  value === 'failed' ? 'failed' : 'active'

/** 기본 보기의 요청서 상태(보류 실패 제외) */
const ACTIVE_REQUEST_STATUSES: AppearanceRequestStatus[] = [
  'HOLD_PENDING',
  'REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELED',
]
/** 기본 보기의 모집글 상태(보류 실패 제외) */
const ACTIVE_RECRUIT_STATUSES: RecruitStatus[] = [
  'HOLD_PENDING',
  'RECRUITING',
  'CLOSED',
  'CANCELED',
]

/** status 목록 요청 값(BE는 List로 받는다. 쉼표로 이어 보낸다) */
const statusQuery = <T extends string>(view: HoldListView, active: T[]) =>
  view === 'failed' ? 'HOLD_FAILED' : active.join(',')

/** HP 보류 결과를 기다리는 글이 보이는 동안 다시 부르는 간격. 보류는 보통 60~120초, 늦어도 1시간 안에 끝난다 */
export const HOLD_PENDING_POLL_MS = 5_000

/** 보류 확인 중(HOLD_PENDING) 글이 있는 동안만 다시 부른다 */
const pollWhileHoldPending = (statuses: string[] | undefined) =>
  statuses?.includes('HOLD_PENDING') ? HOLD_PENDING_POLL_MS : false

export const appearanceKeys = {
  all: ['appearance'] as const,
  requests: (side: RequestSide, page: number, view: HoldListView = 'active') =>
    [...appearanceKeys.all, 'requests', side, page, view] as const,
  request: (requestId: number) =>
    [...appearanceKeys.all, 'request', requestId] as const,
  recruits: (
    tab: RecruitListTab,
    page: number,
    view: HoldListView = 'active',
  ) => [...appearanceKeys.all, 'recruits', tab, page, view] as const,
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
  appearances: (
    role: AppearanceRole,
    page: number,
    view: AppearanceListView = 'ongoing',
  ) => [...appearanceKeys.all, 'appearances', role, page, view] as const,
  todoCount: (side: RequestSide) =>
    [...appearanceKeys.all, 'todo-count', side] as const,
  appearance: (appearanceId: number) =>
    [...appearanceKeys.all, 'appearance', appearanceId] as const,
}

/**
 * 호스트로 보낸 요청(sent) / 게스트로 받은 요청(received). 최신순 고정.
 * 보낸 요청은 보기(view)에 맞는 상태만 받고, 보류 확인 중인 요청서가 보이는 동안 다시 부른다
 */
export const appearanceRequestsQuery = (
  side: RequestSide,
  page: number,
  view: HoldListView = 'active',
) =>
  queryOptions({
    queryKey: appearanceKeys.requests(side, page, view),
    queryFn: () =>
      side === 'host'
        ? api<PagedModel<AppearanceRequestSummary>>(
            '/appearances/requests/sent',
            {
              query: {
                page,
                size: 10,
                status: statusQuery(view, ACTIVE_REQUEST_STATUSES),
              },
            },
          )
        : api<PagedModel<AppearanceRequestSummary>>(
            '/appearances/requests/received',
            { query: { page, size: 10 } },
          ),
    refetchInterval: (query) =>
      side === 'host'
        ? pollWhileHoldPending(query.state.data?.content.map((r) => r.status))
        : false,
    // 같은 역할·보기의 페이지를 넘길 때만 이전 목록을 유지한다. 역할이 바뀌면 이전 목록을 새 역할로
    // 잘못 해석해(상대·상태가 뒤바뀜) 보여 주게 되므로, 새 목록이 올 때까지 로딩으로 둔다.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === side && previousQuery?.queryKey[4] === view
        ? previous
        : undefined,
  })

/** 요청서 상세. 보류 확인 중이면(보낸 호스트에게만 보인다) 끝날 때까지 다시 부른다 */
export const appearanceRequestQuery = (requestId: number) =>
  queryOptions({
    queryKey: appearanceKeys.request(requestId),
    queryFn: () => api<AppearanceRequest>(`/appearances/requests/${requestId}`),
    refetchInterval: (query) =>
      pollWhileHoldPending(
        query.state.data ? [query.state.data.status] : undefined,
      ),
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

/**
 * 모집 중(open, 마감 전만) / 내가 올린 모집글(mine). 최신순 고정.
 * 내 모집글은 보기(view)에 맞는 상태만 받고, 보류 확인 중인 글이 보이는 동안 다시 부른다
 */
export const recruitsQuery = (
  tab: RecruitListTab,
  page: number,
  view: HoldListView = 'active',
) =>
  queryOptions({
    queryKey: appearanceKeys.recruits(tab, page, view),
    queryFn: () =>
      tab === 'mine'
        ? api<PagedModel<RecruitSummary>>('/appearances/recruits/mine', {
            query: {
              page,
              size: 10,
              status: statusQuery(view, ACTIVE_RECRUIT_STATUSES),
            },
          })
        : api<PagedModel<RecruitSummary>>('/appearances/recruits', {
            query: { page, size: 10 },
          }),
    // 같은 탭·보기의 페이지를 넘길 때만 이전 목록을 유지한다(다른 탭·보기 목록을 잠깐이라도 보여 주지 않는다).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === tab && previousQuery?.queryKey[4] === view
        ? previous
        : undefined,
    refetchInterval: (query) =>
      tab === 'mine'
        ? pollWhileHoldPending(query.state.data?.content.map((r) => r.status))
        : false,
  })

/** 모집글 상세. 보류 확인 중이면(올린 호스트에게만 보인다) 끝날 때까지 다시 부른다 */
export const recruitQuery = (recruitId: number) =>
  queryOptions({
    queryKey: appearanceKeys.recruit(recruitId),
    queryFn: () => api<Recruit>(`/appearances/recruits/${recruitId}`),
    refetchInterval: (query) =>
      pollWhileHoldPending(
        query.state.data ? [query.state.data.status] : undefined,
      ),
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

/** 성립한 출연 목록의 보기(주소 `?aview=`): 진행 중(기본) / 끝난 출연 */
export type AppearanceListView = 'ongoing' | 'ended'

/** 주소 값 → 보기. 없거나 모르는 값이면 기본(ongoing) */
export const appearanceListViewOf = (
  value: string | null,
): AppearanceListView => (value === 'ended' ? 'ended' : 'ongoing')

/** 보기별 출연 상태. 진행 중은 아직 HP가 보류된 출연, 끝난 출연은 지급·반환으로 마무리된 출연이다 */
export const APPEARANCE_VIEW_STATUSES: Record<
  AppearanceListView,
  readonly AppearanceStatus[]
> = {
  ongoing: ['ESTABLISHED', 'CANCEL_REQUESTED'],
  ended: ['CONFIRMED', 'ABSENT', 'CANCELED_BY_HOST', 'CANCELED_BY_AGREEMENT'],
}

/** 내 출연 (호스트로 / 게스트로). 보기에 맞는 상태만 받는다. 최신순 고정 */
export const appearancesQuery = (
  role: AppearanceRole,
  page: number,
  view: AppearanceListView = 'ongoing',
) =>
  queryOptions({
    queryKey: appearanceKeys.appearances(role, page, view),
    queryFn: () =>
      api<PagedModel<AppearanceSummary>>('/appearances', {
        query: {
          role,
          status: APPEARANCE_VIEW_STATUSES[view],
          page,
          size: 10,
        },
      }),
    // 같은 역할·보기의 페이지를 넘길 때만 이전 목록을 유지한다(역할이 바뀌면 상대가 뒤바뀐 목록을 보여 주지 않게).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === role && previousQuery?.queryKey[4] === view
        ? previous
        : undefined,
  })

/**
 * 역할 탭의 응답할 일 개수(서버 totalElements). 게스트는 응답 대기 중인 받은 요청, 호스트는 게스트의 취소 요청이 온 출연이다.
 * 호스트의 출연 확인 대기는 상태가 ESTABLISHED라 서버 필터로 셀 수 없어 넣지 않는다(카드 강조만 한다)
 */
export const appearanceTodoCountQuery = (side: RequestSide) =>
  queryOptions({
    queryKey: appearanceKeys.todoCount(side),
    queryFn: () =>
      side === 'guest'
        ? api<PagedModel<unknown>>('/appearances/requests/received', {
            query: { status: ['REQUESTED'], page: 0, size: 1 },
          })
        : api<PagedModel<unknown>>('/appearances', {
            query: {
              role: 'HOST',
              status: ['CANCEL_REQUESTED'],
              page: 0,
              size: 1,
            },
          }),
    select: (data) => data.page.totalElements,
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

/**
 * 출연 리뷰 작성 (호스트·게스트). 출연 확인이 끝난 출연에만, 출연당 방향별 1번(수정·삭제 없음).
 * 201 `{ id }`이고 공개 여부는 응답에 없어 출연 상세를 다시 불러온다
 */
export function writeAppearanceReview(
  appearanceId: number,
  input: AppearanceReviewInput,
) {
  return api<{ id: number }>(`/appearances/${appearanceId}/reviews`, {
    method: 'POST',
    body: input,
  })
}

/** 불참 (호스트). 사유 선택, 기간은 출연 확인과 같고 출연료를 호스트에게 돌려준다(진행은 hpReleaseStatus) */
export function markAppearanceAbsent(appearanceId: number, reason?: string) {
  return api<Appearance>(`/appearances/${appearanceId}/absent`, {
    method: 'POST',
    body: { reason: reason || null },
  })
}
