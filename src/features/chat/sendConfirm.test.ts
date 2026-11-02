import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatKeys } from '@/entities/chat/api'
import type { ChatMessage } from '@/entities/chat/types'
import { rs } from '@/test/renderApp'
import { server } from '@/test/server'
import {
  failAllSending,
  resolvePending,
  retryPending,
  sendChatMessage,
  useChatStore,
} from './chatStore'
import { RECEIPT_POLICY } from './receipt/policy'
import { installSendConfirm } from './sendConfirm'

const ROOM = 5
const TIMEOUT = 1_000

/** 테스트가 정할 때 끝나는 확인 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const mine = (patch: Partial<ChatMessage>): ChatMessage => ({
  messageId: 100,
  chatRoomId: ROOM,
  roomSequence: 1,
  senderUserId: 1,
  messageType: 'TEXT',
  content: '메시지',
  sentAt: '2026-10-29T10:00:00',
  ...patch,
})

let published: string[]
let queryClient: QueryClient
let uninstall: (() => void) | undefined

/** 보낸 메시지의 임시 ID */
function send(content: string, chatRoomId = ROOM) {
  sendChatMessage(chatRoomId, content)
  return published.at(-1)!
}

const pendingOf = (chatRoomId = ROOM) =>
  useChatStore.getState().pending[chatRoomId] ?? []

beforeEach(() => {
  vi.useFakeTimers()
  published = []
  queryClient = new QueryClient()
  // 대화를 열어 둔 상태(이력을 불러 둠). 찾은 메시지는 여기에 합쳐진다.
  queryClient.setQueryData(chatKeys.messages(ROOM), {
    pages: [{ messages: [], nextCursor: null }],
    pageParams: [null],
  })
  useChatStore.setState({
    myUserId: 1,
    viewingRoomId: ROOM,
    pending: {},
    publish: (_room, _content, clientMessageId) => {
      published.push(clientMessageId)
      return true
    },
  })
})

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  vi.useRealTimers()
  useChatStore.setState({
    pending: {},
    publish: () => false,
    myUserId: null,
    viewingRoomId: null,
  })
})

describe('전송 결과 확인', () => {
  it('열지 않은 방이면 찾은 메시지를 이력 캐시에 합치지 않고(사이가 빈다) 보내는 중 표시만 지운다', async () => {
    const lookup = vi.fn()
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('다른 방으로 옮긴 뒤 확인')
    useChatStore.setState({ viewingRoomId: null })
    lookup.mockResolvedValue({
      message: mine({ messageId: 9, roomSequence: 5, clientMessageId: id }),
    })
    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(pendingOf()).toEqual([])
    const history = queryClient.getQueryData<{
      pages: { messages: ChatMessage[] }[]
    }>(chatKeys.messages(ROOM))
    expect(history?.pages[0].messages).toEqual([])
  })

  it('응답이 없으면 이력에서 찾아 보고, 있으면 찾은 메시지를 이력에 합친 뒤 보내는 중 표시를 지운다', async () => {
    // 화면은 최신 한 페이지(다른 메시지)만 들고 있고, 보낸 메시지는 이력의 두 번째 페이지에서 찾았다.
    queryClient.setQueryData(chatKeys.messages(ROOM), {
      pages: [
        {
          messages: [mine({ messageId: 300, roomSequence: 40 })],
          nextCursor: 40,
        },
      ],
      pageParams: [null],
    })
    const lookup = vi.fn()
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('저장됨')
    lookup.mockResolvedValue({
      message: mine({
        messageId: 120,
        roomSequence: 12,
        content: '저장됨',
        clientMessageId: id,
      }),
    })

    await vi.advanceTimersByTimeAsync(TIMEOUT - 1)
    expect(lookup).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(lookup).toHaveBeenCalledWith(ROOM, id, expect.any(AbortSignal))
    expect(pendingOf()).toEqual([])
    const history = queryClient.getQueryData<{
      pages: { messages: ChatMessage[] }[]
    }>(chatKeys.messages(ROOM))
    expect(
      history?.pages.flatMap((p) => p.messages.map((m) => m.messageId)),
    ).toEqual([300, 120])
  })

  it('확인하는 사이 참여 세대가 바뀌었으면 찾은 메시지를 새 세대 이력에 합치지 않는다', async () => {
    const roomWith = (version: number) => [
      {
        chatRoomId: ROOM,
        roomType: 'DIRECT',
        status: 'ACTIVE',
        createdAt: '2026-10-14T10:00:00',
        members: [
          {
            userId: 1,
            nickname: '나',
            active: true,
            participationVersion: version,
          },
        ],
      },
    ]
    queryClient.setQueryData(chatKeys.rooms(), roomWith(2))
    queryClient.setQueryData(chatKeys.messages(ROOM), {
      pages: [{ messages: [], nextCursor: null }],
      pageParams: [null],
    })
    const answer = deferred<{
      message: ChatMessage
      participationVersion: number
    } | null>()
    const lookup = vi.fn().mockReturnValue(answer.promise)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('옛 세대')
    await vi.advanceTimersByTimeAsync(TIMEOUT)

    // 확인을 기다리는 사이 다시 입장해 세대가 3이 됐고, 옛 세대(2) 메시지를 찾았다.
    queryClient.setQueryData(chatKeys.rooms(), roomWith(3))
    answer.resolve({
      message: mine({ messageId: 9, clientMessageId: id, content: '옛 세대' }),
      participationVersion: 2,
    })
    await vi.advanceTimersByTimeAsync(0)

    const history = queryClient.getQueryData<{
      pages: { messages: ChatMessage[] }[]
    }>(chatKeys.messages(ROOM))
    expect(history?.pages[0].messages).toEqual([])
  })

  it('이력을 아직 불러오지 못한 방이면 찾아도 보내는 중 표시를 지우지 않는다(이력을 불러오면 정리된다)', async () => {
    queryClient.removeQueries({ queryKey: chatKeys.messages(ROOM) })
    const lookup = vi.fn()
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('저장됨')
    lookup.mockResolvedValue({ message: mine({ clientMessageId: id }) })
    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(pendingOf()).toHaveLength(1)
  })

  it('보내는 중 표시가 남아도 이력에서 찾았으면 결과가 나온 것이므로 다음 전송에 자리를 넘긴다', async () => {
    queryClient.removeQueries({ queryKey: chatKeys.messages(ROOM) })
    const lookup = vi.fn()
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const ids = Array.from(
      { length: RECEIPT_POLICY.send.maxInFlight },
      (_, i) => send(`저장됨 ${i}`),
    )
    lookup.mockImplementation(
      async (_room: number, clientMessageId: string) => ({
        message: mine({ clientMessageId }),
      }),
    )
    sendChatMessage(ROOM, '자리를 기다림')
    expect(published).toEqual(ids)

    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(pendingOf().every((p) => p.status === 'sending')).toBe(true)
    expect(published).toHaveLength(ids.length + 1)
  })

  it('채팅 연결이 알려 준 세대(관측한 가장 높은 세대)가 바뀌었으면 찾은 옛 세대 메시지를 합치지 않는다', async () => {
    let generation = 2
    const lookup = vi.fn()
    uninstall = installSendConfirm(queryClient, {
      timeoutMs: TIMEOUT,
      lookup,
      generationOf: () => generation,
    })
    const id = send('옛 세대')
    lookup.mockImplementation(async () => {
      // 확인하는 사이 새 세대 프레임으로 세대가 올랐다(방 목록은 아직 옛 세대).
      generation = 3
      return {
        message: mine({ messageId: 4, clientMessageId: id }),
        participationVersion: 2,
      }
    })
    await vi.advanceTimersByTimeAsync(TIMEOUT)

    const history = queryClient.getQueryData<{
      pages: { messages: ChatMessage[] }[]
    }>(chatKeys.messages(ROOM))
    expect(history?.pages[0].messages).toEqual([])
  })

  it('찾은 메시지의 이력 응답 세대를 채팅 연결에 알린다', async () => {
    const noticeGeneration = vi.fn()
    const lookup = vi.fn()
    uninstall = installSendConfirm(queryClient, {
      timeoutMs: TIMEOUT,
      lookup,
      generationOf: () => 2,
      noticeGeneration,
    })
    const id = send('알림')
    lookup.mockResolvedValue({
      message: mine({ clientMessageId: id }),
      participationVersion: 3,
    })
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    expect(noticeGeneration).toHaveBeenCalledWith(ROOM, 3)
  })

  it('기본 확인은 메시지를 찾지 못한 페이지의 참여 세대도 알린다', async () => {
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({ messages: [], nextCursor: null, participationVersion: 3 }),
      ),
    )
    const noticeGeneration = vi.fn()
    uninstall = installSendConfirm(queryClient, {
      timeoutMs: TIMEOUT,
      noticeGeneration,
    })
    send('없음')
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    await vi.waitFor(() =>
      expect(noticeGeneration).toHaveBeenCalledWith(ROOM, 3),
    )
  })

  it('이력에도 없으면 실패가 아니라 결과 미확인으로 바꾼다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('못 찾음')

    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(pendingOf()).toEqual([
      {
        clientMessageId: id,
        content: '못 찾음',
        status: 'unconfirmed',
        error: expect.stringContaining('찾지 못했어요'),
      },
    ])
  })

  it('이력 확인이 실패해도 결과 미확인으로 바꾼다', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('네트워크'))
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    send('확인 실패')

    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(pendingOf()[0]).toMatchObject({
      status: 'unconfirmed',
      error: expect.stringContaining('불러오지 못했어요'),
    })
  })

  it('시간 안에 서버 응답이 오면 이력을 찾지 않는다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('응답 옴')

    resolvePending(mine({ content: '응답 옴', clientMessageId: id }))
    await vi.advanceTimersByTimeAsync(TIMEOUT * 2)

    expect(lookup).not.toHaveBeenCalled()
    expect(pendingOf()).toEqual([])
  })

  it('연결이 끊겨 이미 결과 미확인이면 시간이 지나도 이력을 찾지 않는다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    send('끊김')

    failAllSending()
    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(lookup).not.toHaveBeenCalled()
    expect(pendingOf()[0]).toMatchObject({
      status: 'unconfirmed',
      error: expect.stringContaining('연결이 끊겨'),
    })
  })

  it('보내지 못했으면(연결 없음) 실패로 두고 결과를 확인하지 않는다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    useChatStore.setState({ publish: () => false })
    sendChatMessage(ROOM, '연결 없음')

    await vi.advanceTimersByTimeAsync(TIMEOUT)

    expect(lookup).not.toHaveBeenCalled()
    expect(pendingOf()[0]?.status).toBe('failed')
  })

  it('보낸 메시지마다 따로 기다린다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const first = send('첫째')
    await vi.advanceTimersByTimeAsync(TIMEOUT / 2)
    const second = send('둘째')

    await vi.advanceTimersByTimeAsync(TIMEOUT / 2)
    expect(lookup.mock.calls.map((c) => c.slice(0, 2))).toEqual([[ROOM, first]])
    expect(pendingOf().map((p) => p.status)).toEqual(['unconfirmed', 'sending'])

    await vi.advanceTimersByTimeAsync(TIMEOUT / 2)
    expect(lookup.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      [ROOM, first],
      [ROOM, second],
    ])
    expect(pendingOf().map((p) => p.status)).toEqual([
      'unconfirmed',
      'unconfirmed',
    ])
  })

  it('같은 임시 ID로 다시 보내면 처음부터 다시 기다린다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('다시')
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    expect(pendingOf()[0]?.status).toBe('unconfirmed')

    retryPending(ROOM, id)
    expect(published).toEqual([id, id])
    expect(pendingOf()[0]?.status).toBe('sending')

    await vi.advanceTimersByTimeAsync(TIMEOUT - 1)
    expect(lookup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(pendingOf()[0]?.status).toBe('unconfirmed')
  })

  it('확인하는 동안 다시 보냈으면 이전 확인의 "못 찾음"으로 새 전송을 미확인으로 바꾸지 않는다', async () => {
    const answer = deferred<{ message: ChatMessage } | null>()
    const lookup = vi
      .fn()
      .mockReturnValueOnce(answer.promise)
      .mockResolvedValue({ message: mine({ content: '경합' }) })
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    const id = send('경합')
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    expect(lookup).toHaveBeenCalledTimes(1)

    // 확인을 기다리는 사이 연결이 끊겼다가 다시 보냈다.
    failAllSending()
    retryPending(ROOM, id)
    answer.resolve(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(pendingOf()[0]?.status).toBe('sending')

    // 다시 보낸 것의 확인은 따로 한다.
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(pendingOf()).toEqual([])
  })

  it('이력 확인이 끝나지 않으면 시간 상한 뒤 결과 미확인으로 바꾼다', async () => {
    const lookup = vi.fn().mockReturnValue(new Promise(() => {}))
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    send('멈춤')
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(pendingOf()[0]?.status).toBe('sending')

    await vi.advanceTimersByTimeAsync(TIMEOUT)
    expect(pendingOf()[0]?.status).toBe('unconfirmed')
    const signal = lookup.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(true)
  })

  it('해제하면 기다리던 확인을 버리고 이후 전송도 확인하지 않는다', async () => {
    const lookup = vi.fn().mockResolvedValue(null)
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT, lookup })
    send('해제 전')
    uninstall()
    uninstall = undefined
    send('해제 후')

    await vi.advanceTimersByTimeAsync(TIMEOUT * 2)

    expect(lookup).not.toHaveBeenCalled()
    expect(pendingOf().map((p) => p.status)).toEqual(['sending', 'sending'])
  })
})

describe('기본 확인: 최신 이력에서 내 임시 ID 찾기', () => {
  /** 요청받은 cursor를 기록하고 cursor별 페이지를 돌려준다 */
  function mockHistory(
    pages: Record<
      string,
      { messages: ChatMessage[]; nextCursor: number | null }
    >,
  ) {
    const cursors: (string | null)[] = []
    server.use(
      http.get(`*/api/v1/chats/${ROOM}/messages`, ({ request }) => {
        const params = new URL(request.url).searchParams
        const cursor = params.get('cursor')
        cursors.push(cursor)
        expect(params.get('size')).toBe('30')
        return rs(pages[cursor ?? 'latest'])
      }),
    )
    return cursors
  }

  it('최신 페이지에 없으면 다음 페이지까지 찾아본다', async () => {
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT })
    const id = send('두 번째 페이지')
    const cursors = mockHistory({
      latest: {
        messages: [mine({ messageId: 200, clientMessageId: 'other' })],
        nextCursor: 40,
      },
      40: {
        messages: [mine({ messageId: 150, clientMessageId: id })],
        nextCursor: 10,
      },
    })

    await vi.advanceTimersByTimeAsync(TIMEOUT)
    await vi.waitFor(() => expect(pendingOf()).toEqual([]))
    expect(cursors).toEqual([null, '40'])
  })

  it('두 페이지까지 없으면 결과 미확인으로 바꾼다', async () => {
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT })
    send('없음')
    const cursors = mockHistory({
      latest: { messages: [], nextCursor: 40 },
      40: { messages: [], nextCursor: 10 },
    })

    await vi.advanceTimersByTimeAsync(TIMEOUT)
    await vi.waitFor(() => expect(pendingOf()[0]?.status).toBe('unconfirmed'))
    expect(cursors).toEqual([null, '40'])
  })

  it('이력 조회가 실패하면 결과 미확인으로 바꾼다', async () => {
    uninstall = installSendConfirm(queryClient, { timeoutMs: TIMEOUT })
    send('조회 실패')
    server.use(
      http.get(`*/api/v1/chats/${ROOM}/messages`, () =>
        HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', detail: '잠시 실패' },
          { status: 500 },
        ),
      ),
    )

    await vi.advanceTimersByTimeAsync(TIMEOUT)
    await vi.waitFor(() =>
      expect(pendingOf()[0]).toMatchObject({
        status: 'unconfirmed',
        error: expect.stringContaining('불러오지 못했어요'),
      }),
    )
  })
})
