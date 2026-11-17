import { http, HttpResponse } from 'msw'
import type {
  ChatRequest,
  Faq,
  InfluencerRecommendation,
  LectureRecommendation,
} from '@/entities/chatbot/types'
import type { MemberProfileDetail } from '@/entities/member/types'
import { noAppearanceRating } from './memberProfile'
import { rs } from './renderApp'
import { server } from './server'

/** 챗봇 BE 흉내(BE docs/api/chatbot.md). 테스트는 mockChatbot이 돌려준 state를 바꿔 다음 응답을 정한다 */

export const FAQS: Faq[] = [
  {
    code: 'ACCOUNT_SIGNUP',
    category: 'ACCOUNT',
    question: '회원가입은 어떻게 하나요?',
    answer: '구글 계정이나 이메일로 가입할 수 있어요.',
  },
  {
    code: 'HP_REFUND',
    category: 'HP',
    question: 'HP 환불은 어떻게 하나요?',
    answer: '쓰지 않은 충전 HP는 지갑에서 환불을 신청할 수 있어요.',
  },
  {
    code: 'HP_CHARGE',
    category: 'HP',
    question: 'HP는 어떻게 충전하나요?',
    answer: '지갑에서 충전 버튼을 눌러 결제해요.',
  },
]

export const lectureRecommendation = (
  patch: Partial<LectureRecommendation> = {},
): LectureRecommendation => ({
  items: [
    {
      lectureId: 11,
      title: '데이터 분석 입문',
      score: 0.91,
      reason: 'SIMILAR_TO_PURCHASED',
      reasonText: '구매하신 강의와 비슷해요.',
    },
    {
      lectureId: 12,
      title: '방송용 엑셀 실전',
      score: 0,
      reason: 'POPULAR',
      reasonText: '요즘 많이 듣는 강의예요.',
    },
  ],
  needsInterest: false,
  basis: 'PERSONALIZED',
  fallback: false,
  ...patch,
})

export const influencerRecommendation = (
  patch: Partial<InfluencerRecommendation> = {},
): InfluencerRecommendation => ({
  items: [
    {
      memberId: 42,
      categoryNames: ['게임', '음악'],
      completedAppearances: 3,
      averageRating: 4.5,
      reasons: ['SIMILAR_CATEGORY'],
      explanation: '게임 방송을 3번 했고 평균 별점 4.5로 함께 출연하기 좋아요.',
    },
    {
      memberId: 7,
      categoryNames: [],
      completedAppearances: 12,
      averageRating: null,
      reasons: ['POPULAR'],
      explanation: '출연 경험과 리뷰 평가가 좋은 인기 인플루언서예요.',
    },
  ],
  needsInterest: false,
  basis: 'PERSONALIZED',
  fallback: false,
  ...patch,
})

/** 인플루언서 카드가 부르는 회원 프로필 */
export const INFLUENCER_NICKNAMES: Record<number, string> = {
  42: '게임하는 별',
  7: '먹방왕',
}

const profileOf = (memberId: number): MemberProfileDetail => ({
  id: memberId,
  nickname: INFLUENCER_NICKNAMES[memberId] ?? `회원${memberId}`,
  role: 'VERIFIED_INFLUENCER',
  profileImageUrl: null,
  channels: [],
  appearanceRating: noAppearanceRating,
  contentCategories: [],
  bio: null,
})

/** 오류 응답(ProblemDetail) */
export const problem = (
  status: number,
  code: string,
  detail = '요청을 처리하지 못했어요.',
  headers: Record<string, string> = {},
) =>
  HttpResponse.json(
    { status, code, detail },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', ...headers },
    },
  )

/** 호출 한도 초과(429). Retry-After는 초 */
export const tooManyRequests = (retryAfter = 30) =>
  problem(429, 'TOO_MANY_REQUESTS', '요청이 너무 많아요.', {
    'Retry-After': String(retryAfter),
  })

/** SSE 이벤트 하나 */
export type SseFrame = { event: string; data: unknown }

/**
 * SSE 응답. 이벤트마다 조각 하나로 보낸다. gate를 주면 마지막 이벤트를 보내기 전에 기다린다
 * (답을 받는 중의 화면을 확인할 때 쓴다).
 */
export function sseResponse(frames: SseFrame[], gate?: Promise<void>) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [i, frame] of frames.entries()) {
        if (gate && i === frames.length - 1) await gate
        controller.enqueue(
          encoder.encode(
            `event:${frame.event}\ndata:${JSON.stringify(frame.data)}\n\n`,
          ),
        )
      }
      controller.close()
    },
  })
  return new HttpResponse(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 기다리게 할 약속과 그것을 풀 함수 */
export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

type Reply = Response | Promise<Response>

export type ChatbotMockState = {
  faqs: Faq[]
  /** 강의 추천받기 응답. interest는 보낸 관심사(없으면 null) */
  lecture: (interest: string | null) => Reply
  influencer: (interest: string | null) => Reply
  /** 강의 추천 위젯 응답 */
  widget: () => Reply
  /** 자유 질문 스트림 응답 */
  stream: (request: ChatRequest) => Reply
  /** 받은 요청 기록 */
  faqQueries: (string | null)[]
  lectureInterests: (string | null)[]
  influencerInterests: (string | null)[]
  streamRequests: ChatRequest[]
  widgetCalls: number
}

/** 챗봇 API 전체를 흉내 낸다. 기본은 모두 성공이고 자유 질문은 짧은 답 하나다 */
export function mockChatbot(init: Partial<ChatbotMockState> = {}) {
  const state: ChatbotMockState = {
    faqs: FAQS,
    lecture: () => rs(lectureRecommendation()),
    influencer: () => rs(influencerRecommendation()),
    widget: () => rs(lectureRecommendation()),
    stream: () =>
      sseResponse([
        { event: 'token', data: { text: '안녕하세요' } },
        { event: 'done', data: { sources: [], fallback: false } },
      ]),
    faqQueries: [],
    lectureInterests: [],
    influencerInterests: [],
    streamRequests: [],
    widgetCalls: 0,
    ...init,
  }
  const interestOf = async (request: Request) => {
    const body = (await request.json().catch(() => ({}))) as {
      interest?: string
    }
    return body.interest ?? null
  }
  server.use(
    http.get('*/api/v1/chatbot/faqs', ({ request }) => {
      const category = new URL(request.url).searchParams.get('category')
      state.faqQueries.push(category)
      return rs(
        category
          ? state.faqs.filter((f) => f.category === category)
          : state.faqs,
      )
    }),
    http.post(
      '*/api/v1/chatbot/recommendations/lectures/explained',
      async ({ request }) => {
        const interest = await interestOf(request)
        state.lectureInterests.push(interest)
        return state.lecture(interest)
      },
    ),
    http.post(
      '*/api/v1/chatbot/recommendations/influencers/explained',
      async ({ request }) => {
        const interest = await interestOf(request)
        state.influencerInterests.push(interest)
        return state.influencer(interest)
      },
    ),
    http.get('*/api/v1/chatbot/recommendations/lectures', () => {
      state.widgetCalls++
      return state.widget()
    }),
    http.post('*/api/v1/chatbot/messages/stream', async ({ request }) => {
      const body = (await request.json()) as ChatRequest
      state.streamRequests.push(body)
      return state.stream(body)
    }),
    ...Object.keys(INFLUENCER_NICKNAMES).map((id) =>
      http.get(`*/api/v1/members/${id}`, () => rs(profileOf(Number(id)))),
    ),
  )
  return state
}
