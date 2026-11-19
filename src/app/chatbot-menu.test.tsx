import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { endSession, useChatbotStore } from '@/features/chatbot/store'
import { startNewConversation } from '@/test/chatbotMock'
import { renderApp } from '@/test/renderApp'

afterEach(() => endSession())

type User = ReturnType<typeof userEvent.setup>

async function openWindow(user: User) {
  await user.click(await screen.findByRole('button', { name: '챗봇 열기' }))
  return screen.findByRole('dialog', { name: '합방 챗봇' })
}

describe('챗봇 대화 안 버튼', () => {
  it('인사 아래 버튼을 고르면 내 말풍선과 챗봇 안내가 생기고 인사 버튼은 흐려진다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    const greetingButton = within(dialog).getByRole('button', {
      name: 'FAQ 질문하기',
    })

    await user.click(greetingButton)
    const log = within(dialog).getByRole('log')
    expect(within(log).getByText('FAQ 질문하기')).toBeInTheDocument()
    expect(
      within(log).getByText(/자주 묻는 질문에서 찾아 답해 드릴게요/),
    ).toBeInTheDocument()
    expect(greetingButton).toBeDisabled()
  })

  it('새 대화를 누르면 인사 버튼을 다시 누를 수 있다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '자유 질문' }))
    expect(
      within(dialog).getByRole('button', { name: '자유 질문' }),
    ).toBeDisabled()

    await startNewConversation(user, dialog)
    expect(
      within(dialog).getByRole('button', { name: '자유 질문' }),
    ).toBeEnabled()
    expect(within(dialog).getByRole('log')).toBeEmptyDOMElement()
  })

  it('고른 내용은 새로고침해도 남는다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    await user.click(within(dialog).getByRole('button', { name: '자유 질문' }))

    cleanup()
    useChatbotStore.setState({ open: false, memberId: null, items: [] })
    renderApp('/lectures', 'USER')
    const restored = await openWindow(user)
    expect(
      within(within(restored).getByRole('log')).getByText('자유 질문'),
    ).toBeInTheDocument()
  })
})
