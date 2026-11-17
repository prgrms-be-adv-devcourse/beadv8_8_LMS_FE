import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type {
  Faq,
  FaqCategory,
  InfluencerRecommendation,
  LectureRecommendation,
} from './types'

export const chatbotKeys = {
  all: ['chatbot'] as const,
  /** FAQ 모아보기. 분류가 없으면 전체 */
  faqs: (category: FaqCategory | null) =>
    [...chatbotKeys.all, 'faqs', category ?? 'ALL'] as const,
  lectureWidget: () => [...chatbotKeys.all, 'lecture-widget'] as const,
  influencerWidget: () => [...chatbotKeys.all, 'influencer-widget'] as const,
}

/** FAQ는 운영자가 가끔 바꾸는 정해진 글이라 오래 둔다 */
const FAQ_STALE_MS = 10 * 60_000

/** FAQ 모아보기(호출 한도 없음). 분류를 빼면 전체가 분류·순서대로 온다 */
export const faqsQuery = (category: FaqCategory | null) =>
  queryOptions({
    queryKey: chatbotKeys.faqs(category),
    queryFn: () =>
      api<Faq[]>('/chatbot/faqs', {
        query: { category: category ?? undefined },
      }),
    staleTime: FAQ_STALE_MS,
  })

/**
 * 강의 추천 위젯(LLM 없음, 분당 60회). 429·오류면 화면이 영역을 숨긴다.
 * 한도를 쓰지 않게 다시 시도하지 않고, 같은 화면을 다시 열 때는 잠시 저장한 결과를 쓴다.
 */
export const lectureWidgetQuery = queryOptions({
  queryKey: chatbotKeys.lectureWidget(),
  queryFn: () =>
    api<LectureRecommendation>('/chatbot/recommendations/lectures'),
  retry: false,
  staleTime: 5 * 60_000,
})

/**
 * 인플루언서 추천 위젯(LLM 없음, 분당 60회, FE #220). 429·오류면 이전 결과를 그대로 두고 다시 시도하지 않는다.
 */
export const influencerWidgetQuery = queryOptions({
  queryKey: chatbotKeys.influencerWidget(),
  queryFn: () =>
    api<InfluencerRecommendation>('/chatbot/recommendations/influencers'),
  retry: false,
  staleTime: 5 * 60_000,
})

/** 강의 추천받기 버튼(LLM 이유, 분당 10회). interest가 없으면 활동 기록만으로 찾는다 */
export function requestLectureRecommendation(
  interest: string | null,
  signal?: AbortSignal,
) {
  return api<LectureRecommendation>(
    '/chatbot/recommendations/lectures/explained',
    { method: 'POST', body: interest ? { interest } : {}, signal },
  )
}

/** 인플루언서 추천받기 버튼(LLM 이유, 분당 10회). interest가 없으면 활동 기록만으로 찾는다 */
export function requestInfluencerRecommendation(
  interest: string | null,
  signal?: AbortSignal,
) {
  return api<InfluencerRecommendation>(
    '/chatbot/recommendations/influencers/explained',
    { method: 'POST', body: interest ? { interest } : {}, signal },
  )
}
