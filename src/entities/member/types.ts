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

/**
 * 평점. average는 BE가 소수 첫째 자리로 반올림한 값이고, 리뷰가 없으면 average null·count 0
 */
export type RatingSummary = {
  average: number | null
  count: number
}

/**
 * 프로필 상세의 출연 평점
 * - asHost: 호스트로 출연해 받은 리뷰(게스트가 씀)
 * - asGuest: 게스트로 출연해 받은 리뷰(호스트가 씀)
 */
export type AppearanceRating = {
  total: RatingSummary
  asHost: RatingSummary
  asGuest: RatingSummary
}

/** 회원 공개 정보 (이메일 없음) */
type PublicMember = {
  id: number
  nickname: string
  role: Role
  /** 1시간 유효 주소. 사진이 없으면 null */
  profileImageUrl: string | null
}

/** GET /members/influencers 한 줄. 출연 평점은 전체 하나다 */
export type MemberProfile = PublicMember & { appearanceRating: RatingSummary }

/** 다른 회원도 보는 채널 */
export type Channel = {
  platform: ChannelPlatform
  channelName: string
  channelUrl: string
  followerCount: number
  followerCountAt: string | null
}

/**
 * GET /members/{memberId}. 출연 평점은 목록과 모양이 달라 전체와 받은 역할별로 나뉜다
 */
export type MemberProfileDetail = PublicMember & {
  channels: Channel[]
  appearanceRating: AppearanceRating
}

/** 리뷰를 받은 회원이 그 출연에서 맡은 역할 */
export type RevieweeRole = 'HOST' | 'GUEST'

/** GET /members/{memberId}/appearance-reviews 한 줄 (공개된 리뷰만, 최신 공개순) */
export type ReceivedAppearanceReview = {
  reviewId: number
  appearanceId: number
  revieweeRole: RevieweeRole
  /** 1~5 정수 */
  rating: number
  /** 없으면 null */
  content: string | null
  publishedAt: string
  /** 쓴 회원. 탈퇴했으면 닉네임은 '탈퇴한 회원', 사진은 null */
  reviewer: {
    id: number
    nickname: string
    /** 1시간 유효 주소. 사진이 없으면 null */
    profileImageUrl: string | null
  }
}

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

/** 승급 신청 상태: 심사 중 / 승인(인증된 인플루언서) / 반려(다시 신청 가능) */
export type UpgradeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** GET·POST /members/upgrade-requests (본인만) */
export type UpgradeRequest = {
  id: number
  status: UpgradeRequestStatus
  requestReason: string
  rejectionReason: string | null
  requestedAt: string
  reviewedAt: string | null
}

/** GET /members/admin/upgrade-requests 한 줄 (처리 전이면 reviewedAt·reviewedBy·rejectionReason은 null) */
export type UpgradeReview = {
  requestId: number
  memberId: number
  nickname: string
  requestReason: string
  status: UpgradeRequestStatus
  requestedAt: string
  reviewedAt: string | null
  /** 처리한 관리자 ID */
  reviewedBy: number | null
  rejectionReason: string | null
  /** 그 회원의 승인된 채널. 관리자가 주소로 들어가 활동을 확인한다 */
  channels: {
    platform: ChannelPlatform
    channelName: string
    channelUrl: string
    followerCount: number
  }[]
}

/** 관리자 채널 심사 상태 (목록 필터). REGISTERED는 심사 대상이 아니다 */
export type ChannelReviewStatus = Exclude<
  ChannelVerificationStatus,
  'REGISTERED'
>

/** GET /members/admin/channels 한 줄 (처리 전이면 verifiedAt·verifiedBy·rejectionReason은 null) */
export type ChannelReview = {
  channelId: number
  memberId: number
  nickname: string
  platform: ChannelPlatform
  channelName: string
  channelUrl: string
  followerCount: number
  /** 팔로워 수를 잰 시각. 모르면 null */
  followerCountAt: string | null
  status: ChannelReviewStatus
  /** 승인 요청 시각. 등록하자마자 자동 승인된 채널은 요청이 없어 null */
  requestedAt: string | null
  verifiedAt: string | null
  /** 처리한 관리자 ID. 자동 승인이면 null */
  verifiedBy: number | null
  rejectionReason: string | null
}
