import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatbotKeys } from '@/entities/chatbot/api'
import { endSession } from '@/features/chatbot/store'
import { openAccountMenu } from '@/test/accountMenu'
import { mockChatbot, problem } from '@/test/chatbotMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

afterEach(() => {
  endSession()
  // FAQ는 오래 저장해 두므로 테스트마다 비워 처음 부르는 요청을 확인한다.
  queryClient.removeQueries({ queryKey: chatbotKeys.all })
})

/** 회원은 계정 메뉴, 관리자는 왼쪽 레일의 링크 이름 */
const navLabels = async (admin = false) => {
  const nav = admin
    ? await screen.findByRole('navigation', { name: '주 메뉴' })
    : await openAccountMenu()
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent)
}

describe('자주 묻는 질문 페이지', () => {
  it('전체 질문을 분류 이름과 함께 보이고, 질문을 누르면 답이 펼쳐진다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    renderApp('/support/faq', 'USER')
    expect(
      await screen.findByRole('heading', { level: 1, name: '자주 묻는 질문' }),
    ).toBeInTheDocument()
    const question = await screen.findByText('HP 환불은 어떻게 하나요?')
    expect(state.faqQueries).toEqual([null])
    expect(screen.getAllByText('HP 충전·환불').length).toBeGreaterThan(1)

    const answer = screen.getByText(/지갑에서 환불을 신청/)
    expect(answer).not.toBeVisible()
    await user.click(question)
    expect(answer).toBeVisible()
  })

  it('분류를 고르면 URL에 두고 그 분류만 불러온다', async () => {
    const user = userEvent.setup()
    const state = mockChatbot()
    const router = renderApp('/support/faq', 'USER')
    await screen.findByText('회원가입은 어떻게 하나요?')

    await user.click(screen.getByRole('tab', { name: 'HP 충전·환불' }))
    const panel = screen.getByRole('tabpanel')
    // 전체 목록에서 HP 분류만 남을 때까지 기다린다.
    await waitFor(() =>
      expect(
        within(panel).queryByText('회원가입은 어떻게 하나요?'),
      ).not.toBeInTheDocument(),
    )
    expect(
      await within(panel).findByText('HP는 어떻게 충전하나요?'),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?category=HP')
    expect(state.faqQueries).toEqual([null, 'HP'])

    await user.click(screen.getByRole('tab', { name: '전체' }))
    expect(router.state.location.search).toBe('')
  })

  it('URL의 분류로 열고, 모르는 값이면 전체로 본다', async () => {
    const state = mockChatbot()
    renderApp('/support/faq?category=HP', 'USER')
    expect(
      await screen.findByRole('tab', { name: 'HP 충전·환불' }),
    ).toHaveAttribute('aria-selected', 'true')
    await screen.findByText('HP는 어떻게 충전하나요?')

    act(() => {
      queryClient.removeQueries({ queryKey: chatbotKeys.all })
    })
    renderApp('/support/faq?category=NOPE', 'USER')
    await screen.findAllByText('회원가입은 어떻게 하나요?')
    expect(state.faqQueries).toContain(null)
  })

  it('빈 분류는 안내하고, 불러오지 못하면 다시 시도할 수 있다', async () => {
    const user = userEvent.setup()
    let fail = true
    mockChatbot({ faqs: [] })
    server.use(
      http.get('*/api/v1/chatbot/faqs', () =>
        fail ? problem(400, 'INVALID_REQUEST') : undefined,
      ),
    )
    renderApp('/support/faq', 'USER')
    expect(await screen.findByText('불러오지 못했어요')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(
      await screen.findByText('이 분류에는 아직 질문이 없어요'),
    ).toBeInTheDocument()
  })

  it('회원 계정 메뉴 "지원"에서 고객센터 위에 있고, 이 화면에서 고객센터 메뉴는 켜지지 않는다', async () => {
    mockChatbot()
    renderApp('/support/faq', 'USER')
    const labels = await navLabels()
    expect(labels.indexOf('자주 묻는 질문')).toBe(
      labels.indexOf('고객센터') - 1,
    )
    const nav = screen.getByRole('navigation', { name: '계정 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '자주 묻는 질문' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: '고객센터' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('관리자도 내비 "지원"에서 들어온다', async () => {
    mockChatbot()
    renderApp('/support/faq', 'ADMIN')
    expect(
      await screen.findByRole('heading', { level: 1, name: '자주 묻는 질문' }),
    ).toBeInTheDocument()
    const labels = await navLabels(true)
    expect(labels).toContain('자주 묻는 질문')
    expect(labels).not.toContain('고객센터')
  })

  it('챗봇 창 헤더의 "FAQ ↗"는 창을 연 채로 이 화면으로 가고 대화에 남지 않는다', async () => {
    const user = userEvent.setup()
    mockChatbot()
    const router = renderApp('/lectures', 'USER')
    await user.click(await screen.findByRole('button', { name: '챗봇 열기' }))
    const dialog = await screen.findByRole('dialog', { name: '합방 챗봇' })
    await user.click(
      within(dialog).getByRole('link', { name: 'FAQ 전체 보기' }),
    )
    expect(router.state.location.pathname).toBe('/support/faq')
    expect(
      screen.getByRole('dialog', { name: '합방 챗봇' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('log')).toBeEmptyDOMElement()
  })
})
