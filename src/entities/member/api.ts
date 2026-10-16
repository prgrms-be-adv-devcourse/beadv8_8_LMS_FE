import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { Me } from '@/shared/auth/me'
import type {
  ChannelReview,
  ChannelReviewStatus,
  UpgradeRequest,
  UpgradeRequestStatus,
  UpgradeReview,
  ChannelVerificationResult,
  MemberProfile,
  MemberProfileDetail,
  MyChannel,
} from './types'

export const memberKeys = {
  all: ['member'] as const,
  influencers: (page: number) =>
    [...memberKeys.all, 'influencers', page] as const,
  profile: (memberId: number) =>
    [...memberKeys.all, 'profile', memberId] as const,
  myChannels: () => [...memberKeys.all, 'channels', 'me'] as const,
  myUpgradeRequests: () =>
    [...memberKeys.all, 'upgrade-requests', 'me'] as const,
  upgradeReviews: (status: UpgradeRequestStatus, page: number) =>
    [...memberKeys.all, 'upgrade-reviews', status, page] as const,
  channelReviews: (status: ChannelReviewStatus, page: number) =>
    [...memberKeys.all, 'channel-reviews', status, page] as const,
}

export const INFLUENCER_PAGE_SIZE = 12

/** 인플루언서 목록 (최신 가입순) */
export const influencersQuery = (page: number) =>
  queryOptions({
    queryKey: memberKeys.influencers(page),
    queryFn: () =>
      api<PagedModel<MemberProfile>>('/members/influencers', {
        query: { page, size: INFLUENCER_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  })

export const memberProfileQuery = (memberId: number) =>
  queryOptions({
    queryKey: memberKeys.profile(memberId),
    queryFn: () => api<MemberProfileDetail>(`/members/${memberId}`),
  })

export const myChannelsQuery = queryOptions({
  queryKey: memberKeys.myChannels(),
  queryFn: () => api<MyChannel[]>('/members/channels/me'),
})

/** 닉네임 변경. 보내지 않은 값은 바꾸지 않는다. */
export function updateMe(input: { nickname: string }) {
  return api<Me>('/members/me', { method: 'PATCH', body: input })
}

export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** 프로필 사진 업로드. 본문이 파일 그 자체다(multipart 아님, Content-Type은 파일 형식). */
export function uploadProfileImage(memberId: number, file: File) {
  return api<Me>(`/members/files/${memberId}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
}

/** 프로필 사진 연결 해제 (사진이 없어도 성공) */
export function deleteProfileImage() {
  return api<Me>('/members/me/profile-image', { method: 'DELETE' })
}

/** 채널 승인 요청. 자동 승인되면 유저 → 인플루언서로 역할이 바뀐다. */
export function requestChannelApproval(channelId: number) {
  return api<ChannelVerificationResult>(
    `/members/channels/${channelId}/approval-request`,
    { method: 'POST' },
  )
}

/** 치지직 연동 시작. BE가 치지직 동의 화면으로 보낸 뒤 /mypage?chzzk=…로 돌려보낸다. */
export const CHZZK_CONNECT_URL = '/api/v1/members/channels/chzzk/connect'

/** 승급 신청 사유 최대 길이 (BE InfluencerUpgradeRequest.REASON_MAX) */
export const UPGRADE_REASON_MAX = 500

/** 내 승급 신청 내역 (최신순) */
export const myUpgradeRequestsQuery = queryOptions({
  queryKey: memberKeys.myUpgradeRequests(),
  queryFn: () => api<UpgradeRequest[]>('/members/upgrade-requests/me'),
})

/** 승급 신청. 인플루언서만, 심사 중인 신청은 1건(UPGRADE_REQUEST_ALREADY_PENDING) */
export function requestUpgrade(reason: string) {
  return api<UpgradeRequest>('/members/upgrade-requests', {
    method: 'POST',
    body: { reason },
  })
}

// ── 관리자 승급 심사 ──

/** 반려 사유 최대 길이 (BE RejectRequest, 채널·승급 심사 공통) */
export const REJECTION_REASON_MAX = 500

/** 심사 목록. 정렬은 BE가 오래된 신청부터로 고정한다 */
export const upgradeReviewsQuery = (
  status: UpgradeRequestStatus,
  page: number,
) =>
  queryOptions({
    queryKey: memberKeys.upgradeReviews(status, page),
    queryFn: () =>
      api<PagedModel<UpgradeReview>>('/members/admin/upgrade-requests', {
        query: { status, page, size: 10 },
      }),
    placeholderData: keepPreviousData,
  })

/** 승인: 인증된 인플루언서로 바뀌고 그 회원 세션도 BE가 갱신한다 */
export function approveUpgrade(requestId: number) {
  return api<void>(`/members/admin/upgrade-requests/${requestId}/approve`, {
    method: 'POST',
  })
}

export function rejectUpgrade(requestId: number, reason: string) {
  return api<void>(`/members/admin/upgrade-requests/${requestId}/reject`, {
    method: 'POST',
    body: { reason },
  })
}

// ── 관리자 채널 인증 심사 ──

/** 심사 목록. 정렬은 BE가 오래된 신청부터로 고정한다 */
export const channelReviewsQuery = (
  status: ChannelReviewStatus,
  page: number,
) =>
  queryOptions({
    queryKey: memberKeys.channelReviews(status, page),
    queryFn: () =>
      api<PagedModel<ChannelReview>>('/members/admin/channels', {
        query: { status, page, size: 10 },
      }),
    placeholderData: keepPreviousData,
  })

/** 승인: 회원이 유저면 인플루언서가 되고, 그 회원 세션 권한도 BE가 바로 바꾼다 */
export function approveChannel(channelId: number) {
  return api<void>(`/members/admin/channels/${channelId}/approve`, {
    method: 'POST',
  })
}

/** 반려: 사유 필수, 500자 이하(REJECTION_REASON_MAX). 회원은 내 채널에서 사유를 보고 다시 요청한다 */
export function rejectChannel(channelId: number, reason: string) {
  return api<void>(`/members/admin/channels/${channelId}/reject`, {
    method: 'POST',
    body: { reason },
  })
}
