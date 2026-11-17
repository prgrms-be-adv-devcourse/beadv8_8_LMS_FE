import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatbotKeys } from '@/entities/chatbot/api'
import { endSession } from '@/features/chatbot/store'
import {
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

describe('홈의 강의 추천 위젯', () => {
  it('회원에게 맞춤 추천 강의를 이유와 함께 보이고, 누르면 강의 상세로 간다', async () => {
    const user = userEvent.setup()
    mockChatbot()
    const router = renderApp('/', 'USER')
    const list = await screen.findByRole('list', { name: '추천 강의' })
    expect(
      screen.getByRole('heading', { name: '나에게 맞춘 추천 강의' }),
    ).toBeInTheDocument()
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
    renderApp('/', 'USER')
    expect(
      await screen.findByRole('heading', { name: '요즘 많이 듣는 강의' }),
    ).toBeInTheDocument()
  })

  it('429면 영역을 숨기고 다시 부르지 않는다', async () => {
    const state = mockChatbot({ widget: () => tooManyRequests() })
    renderApp('/', 'USER')
    await screen.findByRole('heading', { name: '인플루언서가 만든 방송 강의' })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('list', { name: '추천 강의' })).toBeNull()
    expect(state.widgetCalls).toBe(1)
  })

  it('추천이 비었으면 영역을 숨긴다', async () => {
    mockChatbot({
      widget: () =>
        rs(lectureRecommendation({ items: [], notice: '추천할 수 없어요.' })),
    })
    renderApp('/', 'USER')
    await screen.findByRole('heading', { name: '인플루언서가 만든 방송 강의' })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('list', { name: '추천 강의' })).toBeNull()
    expect(screen.queryByText('추천할 수 없어요.')).toBeNull()
  })

  it('비회원에게는 부르지 않는다', async () => {
    let called = false
    server.use(
      http.get('*/api/v1/chatbot/recommendations/lectures', () => {
        called = true
        return new HttpResponse(null, { status: 401 })
      }),
    )
    renderApp('/', 'GUEST')
    await screen.findByRole('heading', { name: '인플루언서가 만든 방송 강의' })
    await new Promise((r) => setTimeout(r, 100))
    expect(called).toBe(false)
    expect(screen.queryByRole('list', { name: '추천 강의' })).toBeNull()
  })
})
