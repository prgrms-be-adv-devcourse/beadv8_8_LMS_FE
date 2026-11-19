import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { endSession } from '@/features/chatbot/store'
import {
  deferred,
  influencerRecommendation,
  lectureRecommendation,
  mockChatbot,
  tooManyRequests,
  startNewConversation,
} from '@/test/chatbotMock'
import { renderApp, rs } from '@/test/renderApp'

afterEach(() => endSession())

type User = ReturnType<typeof userEvent.setup>

async function openWindow(user: User) {
  await user.click(await screen.findByRole('button', { name: '챗봇 열기' }))
  return screen.findByRole('dialog', { name: '합방 챗봇' })
}

describe('챗봇 추천받기', () => {
  it('강의 추천은 이유 붙은 카드로 보이고, 카드를 누르면 창을 연 채로 강의 상세로 간다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    const router = renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))

    const cards = await within(dialog).findByRole('list', { name: '추천 강의' })
    expect(within(cards).getByText('데이터 분석 입문')).toBeInTheDocument()
    expect(
      within(cards).getByText('구매하신 강의와 비슷해요.'),
    ).toBeInTheDocument()
    expect(state.lectureInterests).toEqual([null])
    // 고른 것은 내 말풍선으로 남는다.
    expect(
      within(within(dialog).getByRole('log')).getByText('강의 추천', {
        selector: 'p',
      }),
    ).toBeInTheDocument()

    await user.click(
      within(cards).getByRole('link', { name: /데이터 분석 입문/ }),
    )
    expect(router.state.location.pathname).toBe('/lectures/11')
    expect(
      screen.getByRole('dialog', { name: '합방 챗봇' }),
    ).toBeInTheDocument()
  })

  it('인플루언서 추천은 프로필의 닉네임과 분야·출연 수·평점·이유 문장을 보인다', async () => {
    const user = userEvent.setup()
    mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(
      within(dialog).getByRole('button', { name: '인플루언서 추천' }),
    )
    const cards = await within(dialog).findByRole('list', {
      name: '추천 인플루언서',
    })
    const card = await within(cards).findByRole('link', {
      name: /게임하는 별/,
    })
    expect(card).toHaveAttribute('href', '/influencers/42')
    expect(card).toHaveTextContent('게임 · 음악 · 출연 3회 · ★ 4.5')
    expect(card).toHaveTextContent('평균 별점 4.5로 함께 출연하기 좋아요.')
    // 평점이 없으면 평점을 빼고 보인다.
    expect(
      await within(cards).findByRole('link', { name: /먹방왕/ }),
    ).toHaveTextContent('출연 12회')
  })

  it('기다리는 동안 버튼을 잠그고, 받은 뒤 결과 아래 메뉴만 누를 수 있다', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    mockChatbot({
      lecture: async () => {
        await gate.promise
        return rs(lectureRecommendation())
      },
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))

    expect(within(dialog).getByRole('status', { name: '' })).toHaveTextContent(
      '강의 추천을 고르는 중이에요',
    )
    for (const button of within(dialog).getAllByRole('button', {
      name: /추천|질문/,
    }))
      expect(button).toBeDisabled()

    gate.resolve()
    await within(dialog).findByRole('list', { name: '추천 강의' })
    const enabled = within(dialog)
      .getAllByRole('button', { name: '강의 추천' })
      .filter((b) => !(b as HTMLButtonElement).disabled)
    expect(enabled).toHaveLength(1)
  })

  it('맞춤 재료가 없으면 관심사를 받아 같은 추천을 다시 부른다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot({
      lecture: (interest) =>
        rs(
          lectureRecommendation({
            needsInterest: interest === null,
            basis: interest === null ? 'POPULAR' : 'PERSONALIZED',
          }),
        ),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    expect(
      await within(dialog).findByText(
        '관심사를 알려 주면 더 맞게 찾아 드릴게요.',
      ),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '찾기' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '관심사는 1~100자로 적어 주세요.',
    )
    expect(state.lectureInterests).toEqual([null])

    await user.type(
      within(dialog).getByRole('textbox', { name: '관심사' }),
      '  데이터 분석 ',
    )
    await user.click(within(dialog).getByRole('button', { name: '찾기' }))
    expect(
      await within(dialog).findByText('관심사: 데이터 분석'),
    ).toBeInTheDocument()
    await within(dialog).findAllByRole('list', { name: '추천 강의' })
    expect(state.lectureInterests).toEqual([null, '데이터 분석'])
  })

  it('검색이 잠시 실패한 인기순(POPULAR_TEMPORARY)이면 안내하고 같은 관심사로 다시 시도한다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot({
      influencer: () =>
        rs(influencerRecommendation({ basis: 'POPULAR_TEMPORARY' })),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(
      within(dialog).getByRole('button', { name: '인플루언서 추천' }),
    )
    expect(
      await within(dialog).findByText(
        '지금은 맞춤 추천을 준비하지 못해 인기순으로 보여 드려요.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '다시 시도' }))
    expect(
      await within(dialog).findByText('인플루언서 다시 추천받기'),
    ).toBeInTheDocument()
    expect(state.influencerInterests).toEqual([null, null])
  })

  it('맞춤이거나 인기순(POPULAR)이면 인기순 안내를 하지 않는다', async () => {
    const user = userEvent.setup()
    mockChatbot({
      lecture: () => rs(lectureRecommendation({ basis: 'POPULAR' })),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    await within(dialog).findByRole('list', { name: '추천 강의' })
    expect(within(dialog).queryByText(/인기순으로 보여 드려요/)).toBeNull()
  })

  it('추천하지 못했으면(notice) 카드 대신 그 문구를 보인다', async () => {
    const user = userEvent.setup()
    mockChatbot({
      lecture: () =>
        rs(
          lectureRecommendation({
            items: [],
            notice: '지금은 강의를 추천할 수 없어요.',
          }),
        ),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    expect(
      await within(dialog).findByText('지금은 강의를 추천할 수 없어요.'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('list', { name: '추천 강의' })).toBeNull()
  })

  it('호출 한도를 넘으면 기다릴 시간을 안내하고 자동으로 다시 부르지 않는다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot({ lecture: () => tooManyRequests(30) })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    expect(
      await within(dialog).findByText(
        '요청이 많아요. 30초 뒤에 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('다른 것을 해 볼까요?')).toBeInTheDocument()
    expect(state.lectureInterests).toEqual([null])
  })

  it('기다리는 중에 새 대화를 누르면 요청을 끊고 늦게 온 결과를 버린다', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    const state = mockChatbot({
      lecture: async () => {
        await gate.promise
        return rs(lectureRecommendation())
      },
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    await waitFor(() => expect(state.signals).toHaveLength(1))
    expect(state.signals[0].aborted).toBe(false)

    await startNewConversation(user, dialog)
    // 요청 자체를 끊는다.
    await waitFor(() => expect(state.signals[0].aborted).toBe(true))
    gate.resolve()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(dialog).getByRole('log')).toBeEmptyDOMElement()
  })
})

describe('좁은 화면의 추천 카드', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('768px 미만에서 카드를 누르면 창을 닫고 이동한다(대화는 남는다)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 767px)',
    }))
    const user = userEvent.setup()
    mockChatbot()
    const router = renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    const cards = await within(dialog).findByRole('list', { name: '추천 강의' })
    await user.click(
      within(cards).getByRole('link', { name: /데이터 분석 입문/ }),
    )
    expect(router.state.location.pathname).toBe('/lectures/11')
    expect(screen.queryByRole('dialog', { name: '합방 챗봇' })).toBeNull()

    const reopened = await openWindow(user)
    expect(
      within(reopened).getByRole('list', { name: '추천 강의' }),
    ).toBeInTheDocument()
  })
})

describe('관심사로 다시 찾기', () => {
  it('맞춤 재료가 있어도 관심사 칸이 있고, 보내면 그 관심사로 다시 부른다. 지난 결과의 칸은 숨긴다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '강의 추천' }))
    expect(
      await within(dialog).findByText(
        '관심사를 적으면 그에 맞춰 다시 찾아 드려요.',
      ),
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByRole('textbox', { name: '관심사' }),
      '게임 방송',
    )
    await user.click(within(dialog).getByRole('button', { name: '찾기' }))
    await within(dialog).findByText('관심사: 게임 방송')
    await within(dialog).findByText(/관심사를 적으면/)
    expect(state.lectureInterests).toEqual([null, '게임 방송'])
    expect(
      within(dialog).getAllByRole('textbox', { name: '관심사' }),
    ).toHaveLength(1)
  })
})
