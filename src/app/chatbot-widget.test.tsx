import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatbotKeys } from '@/entities/chatbot/api'
import { endSession } from '@/features/chatbot/store'
import {
  influencerRecommendation,
  lectureRecommendation,
  mockChatbot,
  tooManyRequests,
} from '@/test/chatbotMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

afterEach(() => {
  endSession()
  // 위젯 결과는 잠시 저장해 두므로 테스트마다 비워 처음 부르는 요청을 확인한다.
  queryClient.removeQueries({ queryKey: chatbotKeys.all })
})

/** 목록 화면이 그려질 때까지 기다린다(띠가 숨었는지 볼 때) */
const waitForPage = async (title: string) => {
  await screen.findByRole('heading', { level: 1, name: title })
  await new Promise((r) => setTimeout(r, 100))
}

describe('강의 목록 위 추천 강의 띠', () => {
  it('맞춤 추천 강의를 이유와 함께 늘 펼쳐 두고, 누르면 강의 상세로 간다', async () => {
    const user = userEvent.setup()
    mockChatbot()
    const router = renderApp('/lectures', 'USER')
    const strip = await screen.findByRole('region', {
      name: '나에게 맞춘 추천 강의',
    })
    const list = within(strip).getByRole('list', { name: '추천 강의' })
    expect(
      within(list).getByText('구매하신 강의와 비슷해요.'),
    ).toBeInTheDocument()
    await user.click(
      within(list).getByRole('link', { name: /데이터 분석 입문/ }),
    )
    expect(router.state.location.pathname).toBe('/lectures/11')
  })

  it('맞춤 후보가 없어 인기순이면 제목을 바꾼다', async () => {
    mockChatbot({
      widget: () => rs(lectureRecommendation({ basis: 'POPULAR' })),
    })
    renderApp('/lectures', 'USER')
    expect(
      await screen.findByRole('region', { name: '요즘 많이 듣는 강의' }),
    ).toBeInTheDocument()
  })

  it('추천하지 못했으면 notice를 보인다', async () => {
    mockChatbot({
      widget: () =>
        rs(lectureRecommendation({ items: [], notice: '추천할 수 없어요.' })),
    })
    renderApp('/lectures', 'USER')
    expect(await screen.findByText('추천할 수 없어요.')).toBeInTheDocument()
  })

  it('검색어로 찾는 중에는 띠를 두지 않는다', async () => {
    mockChatbot()
    server.use(
      http.get('*/api/v1/search/lectures', () =>
        rs({
          content: [],
          page: { size: 12, number: 0, totalElements: 0, totalPages: 0 },
        }),
      ),
    )
    renderApp('/lectures?keyword=엑셀', 'USER')
    await waitForPage('강의')
    expect(screen.queryByRole('region', { name: /추천 강의/ })).toBeNull()
  })

  it('429면 띠를 숨기고 다시 부르지 않는다', async () => {
    const state = mockChatbot({ widget: () => tooManyRequests() })
    renderApp('/lectures', 'USER')
    await waitForPage('강의')
    expect(screen.queryByRole('list', { name: '추천 강의' })).toBeNull()
    expect(state.widgetCalls).toBe(1)
  })

  it('비회원에게는 부르지 않는다', async () => {
    let called = false
    server.use(
      http.get('*/api/v1/chatbot/recommendations/lectures', () => {
        called = true
        return new HttpResponse(null, { status: 401 })
      }),
    )
    renderApp('/lectures', 'GUEST')
    await waitForPage('강의')
    expect(called).toBe(false)
  })
})

describe('관리자', () => {
  it('관리자도 추천 띠와 챗봇을 쓴다(BE 챗봇 API는 관리자 포함 로그인 회원 전체)', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'ADMIN')
    expect(
      await screen.findByRole('region', { name: '나에게 맞춘 추천 강의' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '챗봇 열기' }))
    const dialog = await screen.findByRole('dialog', { name: '합방 챗봇' })
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    await within(dialog).findByRole('list', { name: '추천 강의' })
    expect(state.lectureInterests).toEqual([null])
  })
})

describe('인플루언서 목록 위 추천 인플루언서 띠', () => {
  it('프로필의 닉네임과 분야·출연 수·평점, 이유 코드의 정해진 문장을 보이고 누르면 프로필로 간다', async () => {
    const user = userEvent.setup()
    mockChatbot()
    const router = renderApp('/influencers', 'USER')
    const strip = await screen.findByRole('region', {
      name: '함께 방송하기 좋은 인플루언서',
    })
    const card = await within(strip).findByRole('link', { name: /게임하는 별/ })
    expect(card).toHaveTextContent('게임 · 음악 · 출연 3회 · ★ 4.5')
    expect(card).toHaveTextContent('내 콘텐츠 분야·소개와 비슷해요')
    await user.click(card)
    expect(router.state.location.pathname).toBe('/influencers/42')
  })

  it('맞춤 재료가 없으면(needsInterest) 프로필 분야를 넣으라고 안내한다', async () => {
    mockChatbot({
      influencerWidget: () =>
        rs(influencerRecommendation({ needsInterest: true, basis: 'POPULAR' })),
    })
    renderApp('/influencers', 'USER')
    const strip = await screen.findByRole('region', {
      name: '요즘 인기 있는 인플루언서',
    })
    expect(
      within(strip).getByText(
        '프로필에 콘텐츠 분야를 입력하면 더 잘 맞는 추천을 받을 수 있어요.',
      ),
    ).toBeInTheDocument()
  })

  it('추천하지 못했으면 notice 문구를 그대로 보인다', async () => {
    mockChatbot({
      influencerWidget: () =>
        rs(
          influencerRecommendation({
            items: [],
            notice: '지금은 인플루언서를 추천할 수 없어요.',
          }),
        ),
    })
    renderApp('/influencers', 'USER')
    expect(
      await screen.findByText('지금은 인플루언서를 추천할 수 없어요.'),
    ).toBeInTheDocument()
  })

  it('모르는 이유 코드만 있으면 이유 문장을 숨긴다', async () => {
    mockChatbot({
      influencerWidget: () =>
        rs(
          influencerRecommendation({
            items: [
              {
                memberId: 42,
                categoryNames: [],
                completedAppearances: 1,
                averageRating: null,
                reasons: ['BRAND_NEW_REASON' as never],
              },
            ],
          }),
        ),
    })
    renderApp('/influencers', 'USER')
    const card = await screen.findByRole('link', { name: /게임하는 별/ })
    expect(card).toHaveTextContent('출연 1회')
    expect(card.textContent).not.toMatch(/요$/)
  })

  it('429면 띠를 숨기고 다시 부르지 않는다', async () => {
    const state = mockChatbot({ influencerWidget: () => tooManyRequests() })
    renderApp('/influencers', 'USER')
    await waitForPage('인플루언서')
    expect(screen.queryByRole('list', { name: '추천 인플루언서' })).toBeNull()
    expect(state.influencerWidgetCalls).toBe(1)
  })
})
