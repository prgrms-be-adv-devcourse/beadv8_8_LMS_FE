import type { Role } from '@/shared/auth/role'

/** 방송 플랫폼 (지금은 치지직만) */
export type ChannelPlatform = 'CHZZK'

/**
 * 채널 인증 상태
 * - REGISTERED: 등록만 됨 (팔로워 기준 미달, 승인 요청 전)
 * - PENDING: 승인 요청, 관리자 심사 대기
 * - APPROVED: 승인 (자동 또는 관리자)
 * - REJECTED: 반려 (다시 승인 요청 가능)
 */
export type ChannelVerificationStatus =
  'REGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED'

/** GET /members/influencers 한 줄 (공개 프로필, 이메일 없음) */
export type MemberProfile = {
  id: number
  nickname: string
  role: Role
  /** 1시간 유효 주소. 사진이 없으면 null */
  profileImageUrl: string | null
}

/** 다른 회원도 보는 채널 */
export type Channel = {
  platform: ChannelPlatform
  channelName: string
  channelUrl: string
  followerCount: number
  followerCountAt: string | null
}

/** GET /members/{memberId} */
export type MemberProfileDetail = MemberProfile & { channels: Channel[] }

/** GET /members/channels/me 한 줄 (본인만) */
export type MyChannel = Channel & {
  id: number
  status: ChannelVerificationStatus
  rejectionReason: string | null
  requestedAt: string | null
}

/** POST /members/channels/{channelId}/approval-request */
export type ChannelVerificationResult = {
  /** APPROVED(자동 승인) 또는 PENDING(관리자 심사 대기) */
  status: ChannelVerificationStatus
  /** 처리 후 내 역할 */
  role: Role
}

export const PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  CHZZK: '치지직',
}
