import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import type { FaqCategory, RecommendBasis } from './types'

/** FAQ 모아보기 탭 순서(BE FaqCategory 순서) */
export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  'ACCOUNT',
  'INFLUENCER',
  'HP',
  'SETTLEMENT',
  'APPEARANCE',
  'APPEARANCE_CANCEL',
  'LECTURE_BUY',
  'LECTURE_SELL',
  'CHAT',
  'SUPPORT',
  'WITHDRAW',
]

const FAQ_CATEGORY_NAME: Record<FaqCategory, string> = {
  ACCOUNT: '회원가입·로그인',
  INFLUENCER: '인플루언서·채널 인증',
  HP: 'HP 충전·환불',
  SETTLEMENT: '수익·환전',
  APPEARANCE: '출연 요청·모집',
  APPEARANCE_CANCEL: '출연 취소·확인',
  LECTURE_BUY: '강의 구매',
  LECTURE_SELL: '강의 판매',
  CHAT: '채팅',
  SUPPORT: '고객센터·이의 제기',
  WITHDRAW: '탈퇴',
}

/** FAQ 분류 이름. 모르는 분류는 '알 수 없음' */
export function faqCategoryName(category: string): string {
  return lookup(FAQ_CATEGORY_NAME, category) ?? UNKNOWN_NAME
}

/**
 * 인기순 안내와 다시 시도를 보여 줄 근거인지. 검색이 잠시 실패했을 때(POPULAR_TEMPORARY)만이다.
 * 모르는 근거는 안내하지 않는다.
 */
export function isTemporaryPopular(basis: RecommendBasis): boolean {
  return basis === 'POPULAR_TEMPORARY'
}
