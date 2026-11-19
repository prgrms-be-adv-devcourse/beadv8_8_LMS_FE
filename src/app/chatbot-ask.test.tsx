import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { applyStreamEvent, streamingAnswer } from '@/features/chatbot/answer'
import {
  endSession,
  updateItems,
  useChatbotStore,
} from '@/features/chatbot/store'
import {
  deferred,
  lectureRecommendation,
  mockChatbot,
  sseResponse,
  tooManyRequests,
  startNewConversation,
} from '@/test/chatbotMock'
import { renderApp } from '@/test/renderApp'

afterEach(() => endSession())

type User = ReturnType<typeof userEvent.setup>

async function openWindow(user: User) {
  await user.click(await screen.findByRole('button', { name: '챗봇 열기' }))
  return screen.findByRole('dialog', { name: '합방 챗봇' })
}

const field = (dialog: HTMLElement) =>
  within(dialog).getByRole('textbox', { name: '챗봇에게 질문' })

async function ask(user: User, dialog: HTMLElement, text: string) {
  await user.type(field(dialog), text)
  await user.keyboard('{Enter}')
}

describe('챗봇 자유 질문', () => {
  it('Enter로 보내면 내 말풍선과 이어 붙는 답을 보이고, 다음 질문은 지난 대화를 함께 보낸다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot({
      stream: ({ message }) =>
        sseResponse([
          { event: 'token', data: { text: `${message}에 ` } },
          { event: 'token', data: { text: '답해요.' } },
          { event: 'done', data: { sources: [], fallback: false } },
        ]),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    // 버튼으로 고른 것은 history에 넣지 않는다.
    await user.click(within(dialog).getByRole('button', { name: '자유 질문' }))
    expect(field(dialog)).toHaveFocus()

    await ask(user, dialog, '환불은?')
    expect(
      await within(dialog).findByText('환불은?에 답해요.'),
    ).toBeInTheDocument()
    expect(field(dialog)).toHaveValue('')

    await ask(user, dialog, '기간은?')
    await within(dialog).findByText('기간은?에 답해요.')
    expect(state.streamRequests).toEqual([
      { message: '환불은?', history: [] },
      {
        message: '기간은?',
        history: [
          { role: 'USER', content: '환불은?' },
          { role: 'ASSISTANT', content: '환불은?에 답해요.' },
        ],
      },
    ])
  })

  it('cards 이벤트의 카드와 참고한 FAQ를 글 아래에 보인다', async () => {
    const user = userEvent.setup()
    mockChatbot({
      stream: () =>
        sseResponse([
          { event: 'token', data: { text: '추천 결과를 아래에 보여 드려요.' } },
          {
            event: 'cards',
            data: {
              lectures: {
                basis: 'POPULAR_TEMPORARY',
                items: lectureRecommendation().items,
              },
            },
          },
          {
            event: 'done',
            data: {
              sources: [{ code: 'LB', question: '강의는 어떻게 사나요?' }],
              fallback: true,
            },
          },
        ]),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await ask(user, dialog, '데이터 강의 추천해 줘')
    const cards = await within(dialog).findByRole('list', { name: '추천 강의' })
    expect(within(cards).getByText('데이터 분석 입문')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '지금은 맞춤 추천을 준비하지 못해 인기순으로 보여 드려요.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('참고한 FAQ')).toBeInTheDocument()
    expect(
      within(dialog).getByText('강의는 어떻게 사나요?'),
    ).toBeInTheDocument()
    // 이 경로에는 다시 시도 버튼을 두지 않는다.
    expect(
      within(dialog).queryByRole('button', { name: '다시 시도' }),
    ).toBeNull()
  })

  it('답을 받는 동안 입력과 버튼을 잠그고, 끝나면 풀고 입력창에 포커스를 준다', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    mockChatbot({
      stream: () =>
        sseResponse(
          [
            { event: 'token', data: { text: '받는 중' } },
            { event: 'done', data: { sources: [], fallback: false } },
          ],
          gate.promise,
        ),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await ask(user, dialog, '질문')
    await within(dialog).findByText('받는 중')
    expect(field(dialog)).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: '보내기' }),
    ).toBeDisabled()

    gate.resolve()
    await waitFor(() => expect(field(dialog)).toBeEnabled())
    expect(field(dialog)).toHaveFocus()
  })

  it('글을 받다가 error가 오면 받은 글은 남기고 안내를 붙인다', async () => {
    const user = userEvent.setup()
    mockChatbot({
      stream: () =>
        sseResponse([
          { event: 'token', data: { text: '앞부분까지' } },
          { event: 'error', data: { message: '답을 만들다 멈췄어요.' } },
        ]),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await ask(user, dialog, '질문')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '답을 만들다 멈췄어요.',
    )
    expect(within(dialog).getByText('앞부분까지')).toBeInTheDocument()
  })

  it('호출 한도를 넘으면 안내와 메뉴를 남기고, 그 질문은 다음 history에서 뺀다', async () => {
    const user = userEvent.setup()
    let limited = true
    const state = mockChatbot({
      stream: () =>
        limited
          ? tooManyRequests(12)
          : sseResponse([
              { event: 'token', data: { text: '답' } },
              { event: 'done', data: {} },
            ]),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await ask(user, dialog, '첫 질문')
    expect(
      await within(dialog).findByText(
        '요청이 많아요. 12초 뒤에 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('첫 질문')).toBeInTheDocument()

    limited = false
    await waitFor(() => expect(field(dialog)).toBeEnabled())
    await ask(user, dialog, '두 번째')
    await within(dialog).findByText('답')
    expect(state.streamRequests[1].history).toEqual([])
  })

  it('Shift+Enter는 줄만 바꾸고, 500자를 넘으면 보낼 수 없다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.type(field(dialog), '첫 줄{Shift>}{Enter}{/Shift}둘째 줄')
    expect(field(dialog)).toHaveValue('첫 줄\n둘째 줄')
    expect(state.streamRequests).toEqual([])

    await user.clear(field(dialog))
    await user.click(field(dialog))
    await user.paste('가'.repeat(501))
    expect(
      within(dialog).getByRole('button', { name: '보내기' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByText('500자까지 보낼 수 있어요 (501자)'),
    ).toBeInTheDocument()
  })

  it('한글 조합을 확정하는 Enter는 보내지 않는다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.type(field(dialog), '환불은')

    // Chrome 계열: 조합 중 Enter는 isComposing으로 온다.
    fireEvent.keyDown(field(dialog), { key: 'Enter', isComposing: true })
    // Safari: 조합이 끝난 뒤 keydown이 와 isComposing이 false이고 keyCode가 229다.
    fireEvent.keyDown(field(dialog), { key: 'Enter', keyCode: 229 })
    expect(state.streamRequests).toEqual([])
    expect(field(dialog)).toHaveValue('환불은')

    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(state.streamRequests).toEqual([
        { message: '환불은', history: [] },
      ]),
    )
  })

  it('터치 기기에서는 Enter가 줄을 바꾸고 보내기 버튼으로 보낸다', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)

    await user.type(field(dialog), '첫 줄{Enter}둘째 줄')
    expect(field(dialog)).toHaveValue('첫 줄\n둘째 줄')
    expect(state.streamRequests).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: '보내기' }))
    await waitFor(() =>
      expect(state.streamRequests).toEqual([
        { message: '첫 줄\n둘째 줄', history: [] },
      ]),
    )
  })

  it('답을 기다리는 중에 새 대화를 누르면 요청을 끊고 대화를 비운다', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    const state = mockChatbot({
      stream: async () => {
        await gate.promise
        return sseResponse([
          { event: 'token', data: { text: '늦게 온 답' } },
          { event: 'done', data: {} },
        ])
      },
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await ask(user, dialog, '질문')
    await waitFor(() => expect(state.signals).toHaveLength(1))
    expect(state.signals[0].aborted).toBe(false)

    await startNewConversation(user, dialog)
    // 요청 자체를 끊는다(받는 도중 끊기면 스트림 읽기가 멈추는 것은 entities/chatbot/stream.test.ts가 본다).
    await waitFor(() => expect(state.signals[0].aborted).toBe(true))
    gate.resolve()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(dialog).getByRole('log')).toBeEmptyDOMElement()
    expect(field(dialog)).toBeEnabled()
  })
})

describe('대화 저장', () => {
  it('답 조각마다 저장하지 않고 질문을 보낼 때와 답이 끝났을 때만 저장한다', async () => {
    const user = userEvent.setup()
    mockChatbot({
      stream: () =>
        sseResponse([
          ...['하', '나', '둘', '셋', '넷'].map((text) => ({
            event: 'token',
            data: { text },
          })),
          { event: 'done', data: {} },
        ]),
    })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await ask(user, dialog, '질문')
    await within(dialog).findByText('하나둘셋넷')
    await waitFor(() => expect(field(dialog)).toBeEnabled())
    const saves = setItem.mock.calls.filter(
      ([key]) => key === 'hapbang.chatbot',
    )
    expect(saves).toHaveLength(2)
    setItem.mockRestore()
  })

  it('답을 받는 중에 새로고침하면 질문은 남고 답은 끊겼다고 표시하며 메뉴를 붙인다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    await openWindow(user)
    // 질문을 보낸 순간(받는 중이 시작됨): 이때 저장한다.
    act(() =>
      updateItems((items) => [
        ...items,
        { id: 'q', kind: 'question', mode: 'FREE', text: '새로고침 전 질문' },
        streamingAnswer('a', 'FREE'),
      ]),
    )
    // 조각이 오는 동안은 저장하지 않는다.
    act(() =>
      updateItems((items) =>
        applyStreamEvent(items, 'a', { type: 'token', text: '받던 글' }),
      ),
    )
    expect(await screen.findByText('받던 글')).toBeInTheDocument()

    // 새로고침: 화면과 메모리의 대화는 사라지고 sessionStorage만 남는다.
    cleanup()
    useChatbotStore.setState({ open: false, memberId: null, items: [] })
    renderApp('/lectures', 'USER')
    const restored = await openWindow(user)
    expect(within(restored).getByText('새로고침 전 질문')).toBeInTheDocument()
    expect(within(restored).queryByText('받던 글')).toBeNull()
    expect(within(restored).getByRole('alert')).toHaveTextContent(
      '화면을 새로 고쳐서 답을 끝까지 받지 못했어요.',
    )
    expect(
      within(restored)
        .getAllByRole('button', { name: '강의 추천' })
        .some((b) => !(b as HTMLButtonElement).disabled),
    ).toBe(true)
  })
})

describe('챗봇 FAQ 질문하기', () => {
  it('고르면 FAQ로 보낸다는 표시가 생기고, 질문 하나만 FAQ API로 보낸 뒤 자유 질문으로 돌아간다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(
      within(dialog).getByRole('button', { name: 'FAQ 질문하기' }),
    )
    expect(
      within(dialog).getByText('자주 묻는 질문에서 찾아 답해요'),
    ).toBeInTheDocument()
    expect(field(dialog)).toHaveFocus()

    await ask(user, dialog, '환불은 어떻게 해요?')
    expect(
      await within(dialog).findByText('FAQ에서 찾은 답이에요.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('HP 환불은 어떻게 하나요?'),
    ).toBeInTheDocument()
    expect(state.faqRequests).toEqual([{ message: '환불은 어떻게 해요?' }])
    expect(state.streamRequests).toEqual([])
    expect(
      within(dialog).queryByText('자주 묻는 질문에서 찾아 답해요'),
    ).toBeNull()

    // 다음 질문은 자유 질문이고, FAQ로 주고받은 것도 history에 넣는다.
    await waitFor(() => expect(field(dialog)).toBeEnabled())
    await ask(user, dialog, '그럼 기간은?')
    await waitFor(() => expect(state.streamRequests).toHaveLength(1))
    expect(state.streamRequests[0].history).toEqual([
      { role: 'USER', content: '환불은 어떻게 해요?' },
      { role: 'ASSISTANT', content: 'FAQ에서 찾은 답이에요.' },
    ])
  })

  it('✕를 누르면 자유 질문으로 돌아간다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(
      within(dialog).getByRole('button', { name: 'FAQ 질문하기' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'FAQ 질문 그만하기' }),
    )
    await ask(user, dialog, '안녕')
    await within(dialog).findByText('안녕하세요')
    expect(state.faqRequests).toEqual([])
    expect(state.streamRequests).toHaveLength(1)
  })
})
