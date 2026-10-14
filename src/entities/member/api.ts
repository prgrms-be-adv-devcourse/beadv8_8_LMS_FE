import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type { Me } from '@/shared/auth/me'
import type {
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
