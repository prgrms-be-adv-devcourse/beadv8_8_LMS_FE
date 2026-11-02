import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import {
  discardPending,
  retryPending,
  sendChatMessage,
  useChatStore,
} from '@/features/chat/chatStore'
import { RECEIPT_POLICY } from '@/features/chat/receipt/policy'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { FakeStompClient } from '@/test/fakeStomp'
import { deliver } from '@/test/chatServer'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PARTNER_ID = 8
const TIMEOUT = RECEIPT_POLICY.send.confirmTimeoutMs
const UNCONFIRMED = '전송 결과를 확인하지 못했어요.'

const room = (): ChatRoom => ({
  chatRoomId: 5,
  roomType: 'DIRECT',
  status: 'ACTIVE',
  createdAt: '2026-10-14T10:00:00',
  members: [
    { userId: ME_ID, nickname: '하늘', active: true, participationVersion: 2 },
    {
      userId: PARTNER_ID,
      nickname: '편집하는 고래',
      active: true,
      participationVersion: 1,
    },
  ],
})

const myMessage = (content: string, clientMessageId: string): ChatMessage => ({
  messageId: 301,
  chatRoomId: 5,
  roomSequence: 1,
  senderUserId: ME_ID,
  messageType: 'TEXT',
  content,
  sentAt: '2026-10-29T10:00:00',
  clientMessageId,
})

/**
 * 채팅 응답을 정한다. 이력은 saved()가 돌려주는 메시지(서버에 저장된 것)이고, 요청 수를 센다.
 * failHistory()가 true면 이력 조회가 실패한다(결과 확인 실패).
 */
function mockChat(
  saved: () => ChatMessage[],
  failHistory: () => boolean = () => false,
) {
  // 읽음 처리(PUT) 전에 CSRF 토큰을 받으러 내 정보를 부르지 않게 한다.
  document.cookie = 'XSRF-TOKEN=t'
  const history = { requests: 0 }
  server.use(
    http.put(
      '*/api/v1/chats/:chatRoomId/read',
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get('*/api/v1/chats', () => rs([room()])),
    http.get('*/api/v1/chats/5/messages', () => {
      history.requests++
      if (failHistory())
        return HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', detail: '잠시 실패' },
          { status: 500 },
        )
      return rs({ messages: saved(), nextCursor: null })
    }),
  )
  return history
}

/** 대화를 열고 채팅 서버에 연결한다. 확인 시간은 가짜 타이머로 넘긴다 */
async function openConnected() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderApp('/chat/5', 'INFLUENCER')
  const input = await screen.findByRole('textbox', { name: '메시지' })
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  await settle()
  const thread = screen.getByRole('region', {
    name: '편집하는 고래 님과의 대화',
  })
  return { user, client, thread, input }
}

/** 대화를 열고 연결한 뒤 메시지 하나를 보낸다. 보낸 임시 ID를 돌려준다 */
async function openAndSend(content: string) {
  const { user, client, thread, input } = await openConnected()
  await user.type(input, content)
  await user.click(screen.getByRole('button', { name: '보내기' }))
  const { clientMessageId } = JSON.parse(client.published.at(-1)!.body)
  return { user, client, thread, clientMessageId: clientMessageId as string }
}

/** 보낸 순서대로의 임시 ID */
const sentIds = (client: FakeStompClient): string[] =>
  client.published.map((p) => JSON.parse(p.body).clientMessageId)

/** 방 5에 보내는 중·실패·결과 미확인으로 남은 메시지의 임시 ID(보낸 순) */
const pendingIds = () =>
  (useChatStore.getState().pending[5] ?? []).map((p) => p.clientMessageId)

const statusOf = (clientMessageId: string) =>
  useChatStore
    .getState()
    .pending[5]?.find((p) => p.clientMessageId === clientMessageId)?.status

/** 응답 확인 시간을 넘긴다 */
const passTimeout = () => act(() => vi.advanceTimersByTimeAsync(TIMEOUT))

/** 진행 중인 조회·변경이 끝나야 그 요청이 다음 테스트로 새지 않는다 */
async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

afterEach(() => {
  // 화면을 먼저 내린다(떠 있는 채로 캐시를 비우면 이력을 새로 불러 다음 테스트로 샌다).
  cleanup()
  vi.useRealTimers()
  queryClient.clear()
  closeLoginModal()
  useChatStore.setState({ pending: {} })
})

describe('전송 결과 미확인', () => {
  it('응답이 없어도 이력에 저장돼 있으면 보낸 것으로 정리하고 한 번만 보여 준다', async () => {
    let saved: ChatMessage[] = []
    mockChat(() => saved)
    const { client, thread, clientMessageId } = await openAndSend('저장됐어요')
    expect(within(thread).getByText('보내는 중…')).toBeInTheDocument()

    // 서버는 저장했지만 응답이 오지 않았다.
    saved = [myMessage('저장됐어요', clientMessageId)]
    await passTimeout()

    await waitFor(() =>
      expect(within(thread).queryByText('보내는 중…')).toBeNull(),
    )
    expect(within(thread).getAllByText('저장됐어요')).toHaveLength(1)
    expect(within(thread).queryByRole('alert')).toBeNull()
    expect(client.published).toHaveLength(1)
    await settle()
  })

  it('이력에서도 찾지 못하면 결과 미확인으로 안내하고, 같은 임시 ID로 다시 보내면 응답이 와도 한 번만 보인다', async () => {
    let saved: ChatMessage[] = []
    mockChat(() => saved)
    const { user, client, thread, clientMessageId } =
      await openAndSend('미확인 메시지')

    await passTimeout()

    const alert = await within(thread).findByRole('alert')
    expect(alert).toHaveTextContent(UNCONFIRMED)
    expect(alert).toHaveTextContent('다시 보내도 두 번 보내지지 않아요.')
    expect(useChatStore.getState().pending[5]?.[0]?.status).toBe('unconfirmed')

    await user.click(within(alert).getByRole('button', { name: '다시 보내기' }))
    expect(client.published).toHaveLength(2)
    const retried = JSON.parse(client.published[1].body)
    expect(retried).toEqual({ content: '미확인 메시지', clientMessageId })
    expect(within(thread).getByText('보내는 중…')).toBeInTheDocument()

    // 서버가 저장하고 돌려준다. 같은 메시지가 다시 와도(재전송 응답), 이력을 다시 불러도 한 번만 보인다.
    const echoed = myMessage('미확인 메시지', clientMessageId)
    saved = [echoed]
    act(() => deliver(client, echoed))
    await waitFor(() =>
      expect(within(thread).queryByText('보내는 중…')).toBeNull(),
    )
    act(() => deliver(client, echoed))
    await act(() => queryClient.invalidateQueries())
    expect(within(thread).getAllByText('미확인 메시지')).toHaveLength(1)
    expect(within(thread).queryByRole('alert')).toBeNull()

    // 다시 보낸 것의 확인 시간이 지나도 이미 정리돼 다시 찾지 않는다.
    await passTimeout()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
    await settle()
  })

  it('이력 확인이 실패해도 결과 미확인으로 안내하고 지울 수 있다', async () => {
    let failing = false
    mockChat(
      () => [],
      () => failing,
    )
    const { user, thread } = await openAndSend('확인 실패')

    failing = true
    await passTimeout()

    const alert = await within(thread).findByRole('alert')
    expect(alert).toHaveTextContent(UNCONFIRMED)
    expect(alert).toHaveTextContent('불러오지 못했어요')

    await user.click(within(alert).getByRole('button', { name: '지우기' }))
    expect(within(thread).queryByText('확인 실패')).toBeNull()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
    await settle()
  })

  it('확인 시간 안에 서버 응답이 오면 이력을 찾아보지 않는다', async () => {
    const history = mockChat(() => [])
    const { client, thread, clientMessageId } = await openAndSend('바로 응답')
    const before = history.requests

    act(() => deliver(client, myMessage('바로 응답', clientMessageId)))
    await waitFor(() =>
      expect(within(thread).queryByText('보내는 중…')).toBeNull(),
    )
    await passTimeout()

    expect(history.requests).toBe(before)
    expect(within(thread).getAllByText('바로 응답')).toHaveLength(1)
    await settle()
  })

  it('연결이 끊기면 보내는 중이던 메시지를 실패가 아닌 결과 미확인으로 바꾼다', async () => {
    mockChat(() => [])
    const { client, thread } = await openAndSend('끊기기 직전')

    act(() => client.disconnect())

    const alert = await within(thread).findByRole('alert')
    expect(alert).toHaveTextContent(UNCONFIRMED)
    expect(alert).toHaveTextContent(
      '연결이 끊겨 전송 여부를 확인하지 못했어요.',
    )
    expect(
      within(alert).getByRole('button', { name: '다시 보내기' }),
    ).toBeInTheDocument()
    expect(
      within(alert).getByRole('button', { name: '지우기' }),
    ).toBeInTheDocument()
    expect(useChatStore.getState().pending[5]?.[0]?.status).toBe('unconfirmed')
    await settle()
  })
})

describe('동시 전송 상한 (BE #419 수신 대기 프레임 상한)', () => {
  const LIMIT = RECEIPT_POLICY.send.maxInFlight
  const sendMany = (count: number, label = '메시지') =>
    act(() => {
      for (let i = 1; i <= count; i++) sendChatMessage(5, `${label} ${i}`)
    })

  it('결과를 기다리는 전송이 상한이면 다음 메시지는 보내는 중으로 두고, 앞선 결과가 나오면 맡긴 순서대로 보낸다', async () => {
    mockChat(() => [])
    const { client, thread } = await openConnected()

    sendMany(LIMIT + 2)
    const ids = pendingIds()
    expect(ids).toHaveLength(LIMIT + 2)
    expect(sentIds(client)).toEqual(ids.slice(0, LIMIT))
    expect(within(thread).getAllByText('보내는 중…')).toHaveLength(LIMIT + 2)

    // 첫 메시지의 서버 응답이 오면 자리가 나 다음 하나를 보낸다.
    act(() => deliver(client, myMessage('메시지 1', ids[0])))
    expect(sentIds(client)).toEqual(ids.slice(0, LIMIT + 1))

    // 나머지는 응답이 없어 확인 시간 뒤 결과 미확인으로 바뀌고, 그때 남은 하나를 보낸다(메시지마다 한 번씩만).
    await passTimeout()
    await waitFor(() => expect(sentIds(client)).toEqual(ids))
    await settle()
  })

  it('서버가 거절하거나(실패 확정) 지운 전송도 자리를 비우고, 자리를 기다리다 지운 메시지는 보내지 않는다', async () => {
    mockChat(() => [])
    const { client } = await openConnected()
    sendMany(LIMIT + 3)
    const ids = pendingIds()
    expect(sentIds(client)).toEqual(ids.slice(0, LIMIT))

    // 자리를 기다리던 첫 메시지를 지우면 보내지 않는다.
    act(() => discardPending(5, ids[LIMIT]))
    expect(sentIds(client)).toEqual(ids.slice(0, LIMIT))

    // 서버가 거절하면(실패 확정) 자리가 나 다음 것을 보낸다.
    act(() =>
      client.push('/user/queue/chats/errors', {
        code: 'INVALID_CHAT_MESSAGE',
        message: '보낼 수 없는 메시지예요.',
        clientMessageId: ids[0],
      }),
    )
    expect(statusOf(ids[0])).toBe('failed')
    expect(sentIds(client)).toEqual([...ids.slice(0, LIMIT), ids[LIMIT + 1]])

    // 보낸 전송을 지워도 자리가 난다.
    act(() => discardPending(5, ids[1]))
    expect(sentIds(client)).toEqual([
      ...ids.slice(0, LIMIT),
      ids[LIMIT + 1],
      ids[LIMIT + 2],
    ])
    await settle()
  })

  it('서버가 수신 상한 초과로 연결을 닫으면(4500) 자리를 기다리던 메시지도 결과 미확인으로 바꾸고, 다시 연결해 다시 보내도 상한을 지킨다', async () => {
    mockChat(() => [])
    const { client, thread } = await openConnected()
    sendMany(LIMIT + 2)
    const ids = pendingIds()

    act(() => client.disconnect({ code: 4500, reason: 'INBOUND_OVERFLOW' }))

    expect(ids.map(statusOf)).toEqual(ids.map(() => 'unconfirmed'))
    expect(within(thread).getAllByRole('alert')).toHaveLength(LIMIT + 2)
    expect(client.published).toHaveLength(LIMIT)

    act(() => client.connect())
    await settle()
    act(() => {
      for (const id of ids) retryPending(5, id)
    })
    // 같은 임시 ID로 상한만큼 다시 보내고, 나머지는 보내는 중으로 기다린다.
    expect(sentIds(client).slice(LIMIT)).toEqual(ids.slice(0, LIMIT))
    expect(ids.map(statusOf)).toEqual(ids.map(() => 'sending'))

    act(() => deliver(client, myMessage('메시지 1', ids[0])))
    expect(sentIds(client).slice(LIMIT)).toEqual(ids.slice(0, LIMIT + 1))
    await settle()
  })

  it('다시 보내기가 자리를 기다리는 동안에는 이전 전송의 확인이 결과 미확인으로 바꾸지 않는다', async () => {
    const history = mockChat(() => [])
    const { client } = await openConnected()
    act(() => sendChatMessage(5, '먼저 보낸 것'))
    const [first] = pendingIds()

    // 연결이 끊겨 결과 미확인이 됐다가 다시 연결된다.
    act(() => client.disconnect())
    act(() => client.connect())
    await settle()
    await act(() => vi.advanceTimersByTimeAsync(2_000))

    // 새 메시지로 자리가 다 찬 뒤 먼저 보낸 것을 다시 보내면 자리를 기다린다.
    sendMany(LIMIT, '새 메시지')
    act(() => retryPending(5, first))
    expect(statusOf(first)).toBe('sending')
    const published = client.published.length
    const lookups = history.requests

    // 처음 보낸 때의 확인 시간은 지났지만 새 메시지들의 확인 시간은 아직이다.
    await act(() => vi.advanceTimersByTimeAsync(TIMEOUT - 1_500))
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(statusOf(first)).toBe('sending')
    expect(history.requests).toBe(lookups)
    expect(client.published).toHaveLength(published)

    // 새 메시지들이 결과 미확인으로 바뀌면 그제야 다시 보낸다.
    await act(() => vi.advanceTimersByTimeAsync(2_000))
    await waitFor(() => expect(sentIds(client).at(-1)).toBe(first))
    expect(statusOf(first)).toBe('sending')
    await settle()
  })
})
