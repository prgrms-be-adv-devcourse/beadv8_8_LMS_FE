/**
 * 챗봇 API 타입 (BE docs/api/chatbot.md, auxiliary-app chatbot 모듈).
 * 코드 값(분류·이유·근거)은 BE가 늘릴 수 있으므로 화면은 labels.ts를 거쳐 읽는다.
 */

/** FAQ 분류 */
export type FaqCategory =
  | 'ACCOUNT'
  | 'INFLUENCER'
  | 'HP'
  | 'SETTLEMENT'
  | 'APPEARANCE'
  | 'APPEARANCE_CANCEL'
  | 'LECTURE_BUY'
  | 'LECTURE_SELL'
  | 'CHAT'
  | 'SUPPORT'
  | 'WITHDRAW'

/** GET /chatbot/faqs 한 줄 */
export type Faq = {
  code: string
  category: FaqCategory
  question: string
  answer: string
}

/**
 * 추천 후보의 근거
 * - PERSONALIZED: 맞춤 후보가 있다(모자란 자리는 인기순으로 채웠을 수 있다)
 * - POPULAR: 맞춤으로 고를 재료가 없어 인기순이다. 다시 해도 같다
 * - POPULAR_TEMPORARY: 검색이 잠시 실패해 인기순으로 대신 답했다. 다시 하면 맞춤이 나올 수 있다
 */
export type RecommendBasis = 'PERSONALIZED' | 'POPULAR' | 'POPULAR_TEMPORARY'

export type LectureRecommendReason =
  'SIMILAR_TO_PURCHASED' | 'SIMILAR_TO_CART' | 'MATCHES_INTEREST' | 'POPULAR'

/** 추천 강의 하나. score는 순서를 정한 값이라 화면에 보이지 않는다 */
export type LectureRecommendItem = {
  lectureId: number
  title: string
  score: number
  reason: LectureRecommendReason
  /** 카드에 보여 줄 이유 문장 */
  reasonText: string
}

export type InfluencerReason =
  | 'SIMILAR_CATEGORY'
  | 'SIMILAR_TO_PARTNERS'
  | 'MATCHES_INTEREST'
  | 'POPULAR'
  | 'PAST_PARTNER'

/** 추천 인플루언서 하나. 닉네임·사진은 없어 회원 프로필(GET /members/{memberId})로 그린다 */
export type InfluencerRecommendItem = {
  memberId: number
  /** 콘텐츠 분야 한글 이름(회원이 고른 순서). 빈 배열일 수 있다 */
  categoryNames: string[]
  /** 이 인플루언서가 완료한 출연 수(누구와든) */
  completedAppearances: number
  /** 받은 출연 리뷰 평균 별점(소수 첫째 자리). 리뷰가 없으면 null */
  averageRating: number | null
  reasons: InfluencerReason[]
  /** 추천 이유 문장. 챗봇 버튼·자유 질문 경로에만 있다 */
  explanation?: string
}

/** 추천 응답(위젯·버튼 공통) */
export type Recommendation<T> = {
  /** 순서대로 보여 준다 */
  items: T[]
  /** 맞춤으로 고를 재료가 없다. 관심사를 받아 다시 부르면 맞춤으로 찾는다 */
  needsInterest: boolean
  basis: RecommendBasis
  /** LLM 이유를 받지 못해 정해진 문장으로 답했다(위젯은 늘 false). 화면은 따로 표시하지 않는다 */
  fallback: boolean
  /** 추천하지 못한 까닭. 추천했으면 없다 */
  notice?: string
}

export type LectureRecommendation = Recommendation<LectureRecommendItem>
export type InfluencerRecommendation = Recommendation<InfluencerRecommendItem>

/** 자유 질문에서 추천 Tool이 만든 카드 한 종류 */
export type RecommendCards<T> = {
  basis: RecommendBasis
  items: T[]
}

/** 자유 질문의 카드. 이번 질문에서 추천을 부른 종류만 온다 */
export type ChatCards = {
  lectures?: RecommendCards<LectureRecommendItem>
  influencers?: RecommendCards<InfluencerRecommendItem>
}

/** 답의 근거 FAQ */
export type FaqSource = {
  code: string
  question: string
}

export type ChatRole = 'USER' | 'ASSISTANT'

/** 자유 질문 요청의 지난 대화 한 줄 */
export type ChatTurn = {
  role: ChatRole
  content: string
}

/** POST /chatbot/messages/stream 본문 */
export type ChatRequest = {
  /** 이번 질문(1~500자) */
  message: string
  /** 지난 대화(오래된 것부터, 이번 질문 제외). history.ts의 buildHistory로 만든다 */
  history: ChatTurn[]
}

/** 자유 질문 스트림 이벤트 */
export type ChatStreamEvent =
  /** 답 조각. 이어 붙인다 */
  | { type: 'token'; text: string }
  /** 글 뒤에 그릴 카드. 한 번 */
  | { type: 'cards'; cards: ChatCards }
  /** 정상 끝 */
  | { type: 'done'; sources: FaqSource[]; fallback: boolean }
  /** 글을 보내다 실패. 받은 글은 남기고 message를 안내로 붙인다 */
  | { type: 'error'; message: string }
