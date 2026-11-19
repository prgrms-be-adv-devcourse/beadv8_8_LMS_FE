import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { addItem, endSession, useChatbotStore } from '@/features/chatbot/store'
import { meQuery, type Me } from '@/shared/auth/me'
import { renderApp } from '@/test/renderApp'

afterEach(() => endSession())

type User = ReturnType<typeof userEvent.setup>

const openWindow = async (user: User) => {
  await user.click(await screen.findByRole('button', { name: '챗봇 열기' }))
  return screen.findByRole('dialog', { name: '합방 챗봇' })
}

const queryWindow = () => screen.queryByRole('dialog', { name: '합방 챗봇' })

const notice = (text: string) => ({ id: text, kind: 'notice' as const, text })

describe('챗봇 창', () => {
  it('비회원이 버튼을 누르면 챗봇 대신 로그인 안내를 띄운다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'GUEST')
    await user.click(await screen.findByRole('button', { name: '챗봇 열기' }))
    expect(
      await screen.findByText('챗봇은 로그인한 뒤에 쓸 수 있어요.'),
    ).toBeInTheDocument()
    expect(queryWindow()).not.toBeInTheDocument()
  })

  it('같은 버튼으로 열고 닫는다. 버튼은 창이 열려도 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByText(/합방 챗봇이에요/)).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: '챗봇 닫기' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(queryWindow()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '챗봇 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('창 안에서 Esc를 누르면 닫고 버튼으로 포커스를 돌려준다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    await openWindow(user)
    await user.keyboard('{Escape}')
    expect(queryWindow()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '챗봇 열기' })).toHaveFocus()
  })

  it('창의 닫기로 닫고, 다시 열면 대화가 남아 있다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    await openWindow(user)
    act(() => addItem(notice('남아 있는 안내')))
    await user.click(screen.getByRole('button', { name: '챗봇 창 닫기' }))
    const dialog = await openWindow(user)
    expect(within(dialog).getByText('남아 있는 안내')).toBeInTheDocument()
  })

  it('다른 화면으로 옮겨도 창과 대화가 그대로다', async () => {
    const user = userEvent.setup()
    const router = renderApp('/lectures', 'USER')
    await openWindow(user)
    act(() => addItem(notice('남아 있는 안내')))
    await act(() => router.navigate('/cart'))
    const dialog = screen.getByRole('dialog', { name: '합방 챗봇' })
    expect(within(dialog).getByText('남아 있는 안내')).toBeInTheDocument()
  })

  it('새로고침해도 이 탭의 대화를 되살린다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    await openWindow(user)
    act(() => addItem(notice('새로고침 전 대화')))

    // 새로고침: 화면과 메모리의 대화는 사라지고 sessionStorage만 남는다.
    cleanup()
    useChatbotStore.setState({ open: false, memberId: null, items: [] })
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    expect(within(dialog).getByText('새로고침 전 대화')).toBeInTheDocument()
  })

  it('새 대화는 한 번 더 묻고 대화를 비운 뒤 입력칸으로 포커스한다. 비어 있으면 누를 수 없다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    const dialog = await openWindow(user)
    const reset = within(dialog).getByRole('button', { name: '새 대화' })
    expect(reset).toBeDisabled()
    act(() => addItem(notice('지울 안내')))

    // 아니요를 누르면 그대로 두고 새 대화 버튼으로 돌아온다
    await user.click(reset)
    await user.click(within(dialog).getByRole('button', { name: '아니요' }))
    expect(within(dialog).getByText('지울 안내')).toBeInTheDocument()
    expect(reset).toHaveFocus()

    // Esc는 창을 닫지 않고 묻기만 접는다
    await user.click(reset)
    expect(within(dialog).getByRole('button', { name: '아니요' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(queryWindow()).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '지우고 새로 시작' }),
    ).toBeNull()
    expect(within(dialog).getByText('지울 안내')).toBeInTheDocument()

    await user.click(reset)
    await user.click(
      within(dialog).getByRole('button', { name: '지우고 새로 시작' }),
    )
    expect(within(dialog).queryByText('지울 안내')).not.toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(dialog).getByRole('textbox', { name: '챗봇에게 질문' }),
      ).toHaveFocus(),
    )
  })

  it('로그아웃하면 대화와 저장값을 지우고, 다른 회원으로 로그인하면 이전 대화가 없다', async () => {
    const user = userEvent.setup()
    renderApp('/lectures', 'USER')
    await openWindow(user)
    act(() => addItem(notice('이전 회원 대화')))
    act(() => {
      queryClient.setQueryData(meQuery.queryKey, null)
    })
    await waitFor(() => expect(queryWindow()).not.toBeInTheDocument())
    expect(sessionStorage.getItem('hapbang.chatbot')).toBeNull()

    const other: Me = {
      id: 2,
      email: 'b@b.c',
      nickname: '바다',
      role: 'USER',
      status: 'ACTIVE',
      profileImageUrl: null,
      contentCategories: [],
      bio: null,
    }
    act(() => {
      queryClient.setQueryData(meQuery.queryKey, other)
    })
    const dialog = await openWindow(user)
    expect(within(dialog).queryByText('이전 회원 대화')).not.toBeInTheDocument()
  })
})
