import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import type { FaqCategory, InfluencerReason, RecommendBasis } from './types'

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

/** FAQ 분류 코드인지(URL 값 등을 고를 때). 모르는 값은 false */
export function isFaqCategory(value: string | null): value is FaqCategory {
  return value !== null && (FAQ_CATEGORIES as readonly string[]).includes(value)
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

/** 인플루언서 추천 이유 코드의 정해진 문장(BE가 LLM 실패 때 쓰는 문장과 같다, FE #220) */
const INFLUENCER_REASON_TEXT: Record<InfluencerReason, string> = {
  SIMILAR_CATEGORY: '내 콘텐츠 분야·소개와 비슷해요',
  SIMILAR_TO_PARTNERS: '함께 출연했던 인플루언서들과 비슷해요',
  MATCHES_INTEREST: '말씀하신 관심사와 잘 맞아요',
  POPULAR: '출연 경험과 리뷰 평가가 좋은 인기 인플루언서예요',
  PAST_PARTNER: '예전에 함께 출연했던 인플루언서예요',
}

/**
 * 이유 문장이 없는 위젯 카드에 보일 문장. 이유 코드 중 아는 첫 코드의 문장이고, 모두 모르는 코드면 없다(숨긴다).
 */
export function influencerReasonText(
  reasons: readonly string[],
): string | undefined {
  for (const reason of reasons) {
    const text = lookup(INFLUENCER_REASON_TEXT, reason)
    if (text) return text
  }
  return undefined
}
