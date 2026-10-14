import type { ChannelVerificationStatus } from './types'

/** 등록할 때 팔로워가 이만큼 이상이면 자동 승인된다 (BE InfluencerChannel). 미달이면 승인 요청 후 관리자 심사 */
export const AUTO_APPROVE_FOLLOWER_COUNT = 10

/** 승인 요청 버튼을 띄울 상태 */
export function canRequestApproval(status: ChannelVerificationStatus) {
  return status === 'REGISTERED' || status === 'REJECTED'
}

/** 치지직 연동 실패 코드(BE MemberErrorCode) → 안내 문구 */
export const CHZZK_FAILURE_MESSAGE: Record<string, string> = {
  INVALID_CHZZK_STATE:
    '연동 요청이 올바르지 않아요. 처음부터 다시 시도해 주세요.',
  CHZZK_REQUEST_REJECTED:
    '치지직 연동이 끝나지 않았어요. 동의 화면에서 취소했다면 다시 시도해 주세요.',
  CHANNEL_ALREADY_REGISTERED: '이미 다른 회원이 등록한 채널이에요.',
  CHZZK_CHANNEL_NOT_FOUND: '치지직에서 채널을 찾을 수 없어요.',
  FORBIDDEN: '채널 인증은 유저 계정만 할 수 있어요.',
}
