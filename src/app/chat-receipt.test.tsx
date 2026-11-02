import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatKeys } from '@/entities/chat/api'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import { useChatStore } from '@/features/chat/chatStore'
import {
  PARTICIPATION_VERSION_HEADER,
  receiptTransports,
  restAckTransport,
  type AckResult,
  type ReceiptAck,
} from '@/features/chat/receipt/contract'
import { RECEIPT_POLICY } from '@/features/chat/receipt/policy'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { FakeStompClient } from '@/test/fakeStomp'
import { deliver } from '@/test/chatServer'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PARTNER_ID = 8
const MY_VERSION = 2

const room = (patch: Partial<ChatRoom> = {}): ChatRoom => ({
  chatRoomId: 5,
  roomType: 'DIRECT',
  status: 'ACTIVE',
  createdAt: '2026-10-14T10:00:00',
  members: [
    {
      userId: ME_ID,
      nickname: '하늘',
      active: true,
      participationVersion: MY_VERSION,
    },
    {
      userId: PARTNER_ID,
      nickname: '편집하는 고래',
      active: true,
      participationVersion: 1,
    },
  ],
  lastMessage: null,
  unreadCount: 0,
  ...patch,
})

const msg = (roomSequence: number): ChatMessage => ({
  messageId: 1000 + roomSequence,
  chatRoomId: 5,
  roomSequence,
  senderUserId: PARTNER_ID,
  messageType: 'TEXT',
  content: `순번 ${roomSequence}`,
  sentAt: '2026-10-14T21:05:00',
})

/**
 * 서버 흉내: 방 5에 저장된 메시지(순번 목록)를 가시 범위 안에서 최신순·cursor 미만으로 나눠 준다(BE와 같은 규칙).
 * saved를 바꾸면 다음 조회부터 반영된다.
 */
function mockServer(initial: number[]) {
  const state = { saved: initial, historyCalls: 0, roomCalls: 0 }
  document.cookie = 'XSRF-TOKEN=t'
  server.use(
    http.put(
      '*/api/v1/chats/:roomId/read',
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get('*/api/v1/chats', () => {
      state.roomCalls++
      const latest = Math.max(0, ...state.saved)
      return rs([room({ lastMessage: latest ? msg(latest) : null })])
    }),
    http.get('*/api/v1/chats/5/messages', ({ request }) => {
      state.historyCalls++
      const url = new URL(request.url)
      const cursor = url.searchParams.get('cursor')
      const size = Number(url.searchParams.get('size') ?? 30)
      const before = cursor === null ? Infinity : Number(cursor)
      const visible = state.saved
        .filter((s) => s < before)
        .sort((a, b) => b - a)
      const page = visible.slice(0, size)
      return rs({
        messages: page.map(msg),
        nextCursor: visible.length > size ? page.at(-1)! : null,
      })
    }),
  )
  return state
}

/** ACK 전송 흉내: 보낸 ACK를 기록하고 정한 결과를 돌려준다 */
function fakeAckTransport(result: () => AckResult = () => 'ok') {
  const sent: ReceiptAck[] = []
  receiptTransports.ack = {
    send: async (ack) => {
      sent.push(ack)
      return result()
    },
  }
  return sent
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const settle = () => waitFor(() => expect(queryClient.isFetching()).toBe(0))
/** debounce·최대 대기가 지나 ACK가 나갈 만큼 시간을 보낸다 */
const passAckWait = () => advance(RECEIPT_POLICY.ack.maxWaitMs + 100)

async function openRoom(firstText: string) {
  renderApp('/chat/5', 'INFLUENCER')
  const thread = await screen.findByRole('region', { name: /님과의 대화/ })
  await within(thread).findByText(firstText)
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  await settle()
  return { thread, client }
}
const push = (
  client: FakeStompClient,
  m: ChatMessage,
  headers: Record<string, string> = {},
) => act(() => deliver(client, m, headers))

const original = { ...receiptTransports }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  queryClient.clear()
  closeLoginModal()
  useChatStore.setState({ pending: {} })
  Object.assign(receiptTransports, original)
})

describe('수신 확인(ACK)', () => {
  it('처음부터 이어진 구간만 확인한다: 중간이 빠진 채 높은 순번이 오면 채운 뒤에야 그 순번을 확인한다', async () => {
    const acks = fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')
    await passAckWait()
    expect(acks.at(-1)).toEqual({
      chatRoomId: 5,
      participationVersion: MY_VERSION,
      receivedSequence: 5,
    })

    // 6은 서버에 저장됐지만 이 기기는 받지 못했고 7만 왔다. 이력을 다시 부르기 전 응답을 붙잡아 7만 반영된 상태를 본다.
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        await gate
        return rs({
          messages: [7, 6, 5, 4, 3, 2, 1].map(msg),
          nextCursor: null,
        })
      }),
    )
    state.saved = range(1, 7)
    push(client, msg(7))
    await within(thread).findByText('순번 7')
    await passAckWait()
    // 6을 확인하기 전에는 7을 ACK하지 않는다.
    expect(acks.every((a) => a.receivedSequence <= 5)).toBe(true)

    release()
    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    await passAckWait()
    expect(acks.at(-1)?.receivedSequence).toBe(7)
    await settle()
  })

  it('첫 페이지만으로는 확인하지 않고, 이력을 처음까지 이어 읽어 대조한 뒤 확인한다(여러 페이지)', async () => {
    const acks = fakeAckTransport()
    const state = mockServer(range(1, 70))
    await openRoom('순번 70')
    await passAckWait()
    await settle()

    // 화면은 최신 30개만 그리지만, 대조가 처음(1)까지 읽어야 70을 확인한다.
    expect(acks.at(-1)?.receivedSequence).toBe(70)
    expect(state.historyCalls).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText('순번 1')).toBeNull()
  })

  it('페이지가 많은 방도 대조할 때마다 이어 읽어 결국 처음에 닿고 확인한다(최신 페이지만 반복해 읽지 않는다)', async () => {
    const acks = fakeAckTransport()
    // 250개 = 30개씩 9페이지. 한 번 대조에 최대 5페이지만 읽는다.
    const state = mockServer(range(1, 250))
    await openRoom('순번 250')
    const { intervalMs, jitterRatio } = RECEIPT_POLICY.reconcile
    for (let i = 0; i < 3 && acks.length === 0; i++) {
      await advance(intervalMs * (1 + jitterRatio) + 100)
      await settle()
      await passAckWait()
    }

    expect(acks.at(-1)?.receivedSequence).toBe(250)
    // 9페이지를 읽는 데 한 번씩만 더 읽는다(처음 열기·연결 재조회·주기마다 최신 1페이지 정도).
    expect(state.historyCalls).toBeLessThan(20)
  })

  it('연결이 유지된 채 마지막 메시지만 유실되면 주기 대조로 찾아 화면에 채우고 확인한다', async () => {
    const acks = fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread } = await openRoom('순번 5')
    await passAckWait()

    // 6이 저장됐지만 실시간으로 오지 않았다(다음 메시지가 없어 순번 간격으로도 알 수 없다).
    state.saved = range(1, 6)
    const { intervalMs, jitterRatio } = RECEIPT_POLICY.reconcile
    await advance(intervalMs * (1 + jitterRatio) + 100)

    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    await passAckWait()
    expect(acks.at(-1)?.receivedSequence).toBe(6)
    await settle()
  })

  it('로컬 데이터를 잃으면(새로 열기) 서버 확인 위치를 쓰지 않고 이력을 다시 대조해 확인한다', async () => {
    const acks = fakeAckTransport()
    mockServer(range(1, 40))
    await openRoom('순번 40')
    await passAckWait()
    expect(acks.at(-1)?.receivedSequence).toBe(40)

    // 탭을 새로 연 것처럼 화면·연결·캐시를 모두 버린다(서버에는 40까지 확인이 남아 있다).
    cleanup()
    queryClient.clear()
    acks.length = 0
    await openRoom('순번 40')
    await passAckWait()
    await settle()
    // 새 기기 상태는 이력을 처음부터 다시 읽어 확인한 뒤에만 보낸다.
    expect(acks.at(-1)?.receivedSequence).toBe(40)
  })

  it('옛 참여 세대라고 거절되면(stale) 다시 보내지 않고 방 목록·이력을 다시 맞춘다', async () => {
    let result: AckResult = 'stale'
    const acks = fakeAckTransport(() => result)
    const state = mockServer(range(1, 3))
    await openRoom('순번 3')
    const before = { ...state }
    await passAckWait()
    await settle()

    expect(acks).toHaveLength(1)
    expect(state.roomCalls).toBeGreaterThan(before.roomCalls)
    result = 'ok'
    await passAckWait()
    await settle()
  })

  it('세대 불일치(stale)로 거절되면 재조회가 실패해도 옛 세대 이력·보내는 중 표시를 먼저 버린다', async () => {
    fakeAckTransport(() => 'stale')
    mockServer(range(1, 3))
    const { thread } = await openRoom('순번 3')
    act(() =>
      useChatStore.setState({
        pending: {
          5: [
            {
              clientMessageId: 'old',
              content: '옛 세대 전송',
              status: 'unconfirmed',
            },
          ],
        },
      }),
    )
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', detail: '실패' },
          { status: 500 },
        ),
      ),
    )
    await passAckWait()
    await advance(10_000)
    await settle()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
    expect(within(thread).queryByText('순번 3')).toBeNull()
  })

  it('응답을 받지 못하면(retry) 같은 세대의 최신 값으로 정해진 횟수까지만 다시 보내고, 회복되면 다음 대조 때 다시 보낸다', async () => {
    let result: AckResult = 'retry'
    const acks = fakeAckTransport(() => result)
    mockServer(range(1, 3))
    await openRoom('순번 3')
    await passAckWait()
    // 다시 보내기 대기(2·4·8초)가 모두 지나도록, 다음 주기 대조(30초) 전까지만 본다.
    const { maxRetries, retryBaseMs } = RECEIPT_POLICY.ack
    await advance(retryBaseMs * 2 ** maxRetries + 100)

    expect(acks.length).toBe(maxRetries + 1)
    expect(new Set(acks.map((a) => a.receivedSequence))).toEqual(new Set([3]))

    // 네트워크가 회복됐다. 방이 조용해도 다음 주기 대조가 같은 값을 다시 연다.
    result = 'ok'
    const { intervalMs, jitterRatio } = RECEIPT_POLICY.reconcile
    await advance(intervalMs * (1 + jitterRatio))
    await settle()
    await passAckWait()
    expect(acks.length).toBe(maxRetries + 2)
    expect(acks.at(-1)?.receivedSequence).toBe(3)
    await settle()
  })
})

describe('재시도를 다 쓴 ACK 다시 열기', () => {
  /** ACK 재시도(2·4·8초)를 모두 쓰게 한다. 보낸 수를 돌려준다 */
  async function exhaust() {
    await passAckWait()
    const { maxRetries, retryBaseMs } = RECEIPT_POLICY.ack
    await advance(retryBaseMs * 2 ** maxRetries + 100)
    return maxRetries + 1
  }
  /**
   * 다시 연 ACK가 나갈 때까지 시간을 보낸다. 대조는 방 목록 응답 뒤에 비동기로 시작하므로(부하가 높으면 늦게 시작)
   * 한 번의 대기로 단정하지 않는다. 그 뒤 한 번 더 기다려 같은 값을 다시 보내지 않는지 본다
   */
  async function expectResentOnce(acks: ReceiptAck[], sent: number) {
    for (let i = 0; i < 10 && acks.length <= sent; i++) {
      await settle()
      await passAckWait()
    }
    expect(acks.length).toBeGreaterThan(sent)
    await settle()
    await passAckWait()
    expect(acks.length).toBe(sent + 1)
    expect(acks.at(-1)?.receivedSequence).toBe(3)
  }
  const resyncSignal = (client: FakeStompClient) =>
    act(() =>
      client.push('/user/queue/chats/sync', {
        type: 'RESYNC',
        reason: 'X',
        occurredAt: '2026-10-29T10:00:00',
      }),
    )

  it('회복 뒤 다시 연결되면 다음 주기를 기다리지 않고 다시 보낸다', async () => {
    let result: AckResult = 'retry'
    const acks = fakeAckTransport(() => result)
    mockServer(range(1, 3))
    const { client } = await openRoom('순번 3')
    const sent = await exhaust()
    expect(acks.length).toBe(sent)

    result = 'ok'
    act(() => client.disconnect())
    await advance(100)
    act(() => client.connect())
    await expectResentOnce(acks, sent)
    await settle()
  })

  it('회복 뒤 재동기화 신호가 오면 다시 보낸다', async () => {
    let result: AckResult = 'retry'
    const acks = fakeAckTransport(() => result)
    mockServer(range(1, 3))
    const { client } = await openRoom('순번 3')
    const sent = await exhaust()

    result = 'ok'
    resyncSignal(client)
    await expectResentOnce(acks, sent)
    await settle()
  })

  it('계속 실패하면 주기 대조로는 정해진 횟수까지만 다시 열고, 재동기화 신호는 다시 연다', async () => {
    const acks = fakeAckTransport(() => 'retry')
    mockServer(range(1, 3))
    const { client } = await openRoom('순번 3')
    await exhaust()
    const { intervalMs, jitterRatio } = RECEIPT_POLICY.reconcile
    const counts: number[] = []
    for (let i = 0; i < RECEIPT_POLICY.ack.maxReopenCycles + 3; i++) {
      await advance(intervalMs * (1 + jitterRatio) + 100)
      await settle()
      await advance(
        RECEIPT_POLICY.ack.retryBaseMs * 2 ** RECEIPT_POLICY.ack.maxRetries +
          100,
      )
      counts.push(acks.length)
    }
    // 상한 뒤로는 늘지 않는다.
    expect(counts.at(-1)).toBe(counts.at(-3))

    const stable = acks.length
    resyncSignal(client)
    await settle()
    await passAckWait()
    expect(acks.length).toBeGreaterThan(stable)
    await settle()
  })
})

describe('계약 경로 (REST ACK·재동기화 신호)', () => {
  it('PUT /chats/{id}/received로 보내고, 다른 기기가 더 올린 서버 커서를 이 기기 확인 위치로 쓰지 않는다', async () => {
    receiptTransports.ack = restAckTransport
    const bodies: unknown[] = []
    server.use(
      http.put('*/api/v1/chats/5/received', async ({ request }) => {
        bodies.push(await request.json())
        // 다른 기기가 이미 50까지 확인했다.
        return rs({
          chatRoomId: 5,
          participationVersion: MY_VERSION,
          lastReceivedSequence: 50,
        })
      }),
    )
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')
    await passAckWait()
    expect(bodies).toEqual([
      { participationVersion: MY_VERSION, receivedSequence: 5 },
    ])

    // 이 기기는 6을 놓친 채 7을 받았다. 서버 커서(50)와 관계없이 6을 채우기 전에는 7을 보내지 않는다.
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        await gate
        return rs({
          messages: [7, 6, 5, 4, 3, 2, 1].map(msg),
          nextCursor: null,
          participationVersion: MY_VERSION,
          visibleFromSequence: 1,
        })
      }),
    )
    state.saved = range(1, 7)
    push(client, msg(7))
    await within(thread).findByText('순번 7')
    await passAckWait()
    expect(bodies).toHaveLength(1)

    release()
    await within(thread).findByText('순번 6')
    await passAckWait()
    expect(bodies.at(-1)).toEqual({
      participationVersion: MY_VERSION,
      receivedSequence: 7,
    })
    await settle()
  })

  it('409 STALE_PARTICIPATION이면 다시 보내지 않고 방 목록을 다시 받는다', async () => {
    receiptTransports.ack = restAckTransport
    let puts = 0
    server.use(
      http.put('*/api/v1/chats/5/received', () => {
        puts++
        return HttpResponse.json(
          { status: 409, code: 'STALE_PARTICIPATION', detail: '옛 세대' },
          { status: 409 },
        )
      }),
    )
    const state = mockServer(range(1, 3))
    await openRoom('순번 3')
    const before = state.roomCalls
    await passAckWait()
    await settle()
    expect(puts).toBe(1)
    expect(state.roomCalls).toBeGreaterThan(before)
  })

  it('재동기화 신호(모르는 사유 포함)를 받으면 방금 받은 최신 페이지도 생략하지 않고 바로 대조해 마지막 유실을 채운다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')

    // 최신 페이지를 방금 받았더라도(재조회 생략 시간 안) 신호를 받으면 다시 읽는다.
    state.saved = range(1, 6)
    act(() =>
      client.push('/user/queue/chats/sync', {
        type: 'RESYNC',
        reason: 'SOMETHING_NEW',
        occurredAt: '2026-10-29T10:00:00',
      }),
    )
    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    await settle()
  })
})

describe('참여 세대가 바뀐 이력', () => {
  it('방 목록이 새 세대를 알려 주면(다른 기기에서 재입장) 옛 세대 이력·보내는 중 표시를 버리고 새로 불러온다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 3))
    const { thread } = await openRoom('순번 3')
    act(() =>
      useChatStore.setState({
        pending: {
          5: [
            {
              clientMessageId: 'old',
              content: '옛 세대에서 보내던 말',
              status: 'unconfirmed',
            },
          ],
        },
      }),
    )
    expect(
      await within(thread).findByText('옛 세대에서 보내던 말'),
    ).toBeInTheDocument()

    // 다른 기기에서 나갔다가 다시 들어와 세대가 3이 됐다. 이 탭은 실시간 프레임을 놓쳤고 방 목록으로 알게 된다.
    const before = state.historyCalls
    server.use(
      http.get('*/api/v1/chats', () =>
        rs([
          room({
            members: [
              {
                userId: ME_ID,
                nickname: '하늘',
                active: true,
                participationVersion: 3,
              },
              {
                userId: PARTNER_ID,
                nickname: '편집하는 고래',
                active: true,
                participationVersion: 1,
              },
            ],
          }),
        ]),
      ),
    )
    await act(() => queryClient.refetchQueries({ queryKey: ['chat', 'rooms'] }))
    await settle()

    expect(useChatStore.getState().pending[5]).toBeUndefined()
    expect(within(thread).queryByText('옛 세대에서 보내던 말')).toBeNull()
    expect(state.historyCalls).toBeGreaterThan(before)
  })

  it('옛 세대의 이력 응답은 화면에 넣지 않고 다시 불러온다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    let calls = 0
    server.use(
      http.get('*/api/v1/chats/5/messages', () => {
        calls++
        // 첫 응답은 세대가 바뀌기 전에 만들어진 옛 세대(1) 응답이다.
        return calls === 1
          ? rs({
              messages: [{ ...msg(9), content: '옛 세대 이력' }],
              nextCursor: null,
              participationVersion: 1,
            })
          : rs({
              messages: [3, 2, 1].map(msg),
              nextCursor: null,
              participationVersion: MY_VERSION,
            })
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await advance(5_000)
    expect(await within(thread).findByText('순번 3')).toBeInTheDocument()
    expect(within(thread).queryByText('옛 세대 이력')).toBeNull()
    await settle()
  })
})

describe('부분 실패·연속 신호', () => {
  it('여러 페이지를 다시 부르다 중간 페이지가 실패하면, 캐시에 반영되지 않은 구간을 확인하지 않는다', async () => {
    const acks = fakeAckTransport()
    const state = mockServer(range(1, 40))
    const { thread } = await openRoom('순번 40')
    await userEvent.click(
      await screen.findByRole('button', { name: '이전 메시지 더 보기' }),
    )
    await within(thread).findByText('순번 1')
    await passAckWait()
    await settle()
    expect(acks.at(-1)?.receivedSequence).toBe(40)

    // 41~45가 저장됐다. 다시 부르면 첫 페이지는 받지만 두 번째 페이지가 실패한다.
    state.saved = range(1, 45)
    server.use(
      http.get('*/api/v1/chats/5/messages', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (cursor !== null)
          return HttpResponse.json(
            { status: 500, code: 'INTERNAL_ERROR', detail: '실패' },
            { status: 500 },
          )
        return rs({
          messages: range(16, 45).reverse().map(msg),
          nextCursor: 16,
        })
      }),
    )
    await act(() =>
      queryClient
        .refetchQueries({ queryKey: ['chat', 'messages', 5] })
        .catch(() => undefined),
    )
    await advance(10_000)
    await passAckWait()
    await settle()

    expect(acks.every((a) => a.receivedSequence <= 40)).toBe(true)
  })

  it('새 세대 프레임이 잇달아 와도 방 목록 재조회는 한 번만 한다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 3))
    const { client } = await openRoom('순번 3')
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let roomCalls = 0
    server.use(
      http.get('*/api/v1/chats', async () => {
        roomCalls++
        await gate
        return rs([room()])
      }),
    )
    for (const seq of [4, 5, 6])
      push(client, msg(seq), {
        [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION + 1),
      })
    await waitFor(() => expect(roomCalls).toBe(1))
    release()
    await settle()
    expect(roomCalls).toBe(1)
    expect(state.historyCalls).toBeGreaterThan(0)
  })
})

describe('읽음 처리의 참여 세대 (BE #420)', () => {
  it('읽음에 이력 응답의 참여 세대를 붙여 보내고, 409 STALE_PARTICIPATION이면 다시 보내지 않고 방을 다시 맞춘다', async () => {
    fakeAckTransport()
    const reads: unknown[] = []
    const state = mockServer(range(1, 3))
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({
          messages: [3, 2, 1].map(msg),
          nextCursor: null,
          participationVersion: MY_VERSION,
          visibleFromSequence: 1,
        }),
      ),
      http.put('*/api/v1/chats/5/read', async ({ request }) => {
        reads.push(await request.json())
        return HttpResponse.json(
          { status: 409, code: 'STALE_PARTICIPATION', detail: '옛 세대' },
          { status: 409 },
        )
      }),
    )
    await openRoom('순번 3')
    await waitFor(() => expect(reads).toHaveLength(1))
    expect(reads[0]).toEqual({
      lastReadSequence: 3,
      participationVersion: MY_VERSION,
    })
    await settle()
    // 방을 다시 맞췄다(방 목록을 다시 불렀다).
    expect(state.roomCalls).toBeGreaterThan(1)

    // 다시 보내기 대기(3초 × 횟수)가 지나도 다시 보내지 않는다.
    await advance(20_000)
    await settle()
    expect(reads).toHaveLength(1)
  })
})

describe('세대 전환 경합', () => {
  const roomV = (version: number) =>
    room({
      members: [
        {
          userId: ME_ID,
          nickname: '하늘',
          active: true,
          participationVersion: version,
        },
        {
          userId: PARTNER_ID,
          nickname: '편집하는 고래',
          active: true,
          participationVersion: 1,
        },
      ],
    })

  it('새 세대를 기다리는 동안 늦게 온 옛 세대 프레임은 적용하지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { thread, client } = await openRoom('순번 3')
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/chats', async () => {
        await gate
        return rs([roomV(MY_VERSION + 1)])
      }),
    )
    push(client, msg(4), {
      [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION + 1),
    })
    // 방 목록이 아직 옛 세대(2)인 동안 옛 세대 프레임이 늦게 왔다.
    push(
      client,
      { ...msg(5), content: '늦은 옛 세대' },
      { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION) },
    )
    expect(within(thread).queryByText('늦은 옛 세대')).toBeNull()
    release()
    await settle()
    expect(within(thread).queryByText('늦은 옛 세대')).toBeNull()
  })

  it('새 세대 이력이 방 목록보다 먼저 와도 옛 세대의 보내는 중 표시를 버린다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { thread } = await openRoom('순번 3')
    act(() =>
      useChatStore.setState({
        pending: {
          5: [
            {
              clientMessageId: 'old',
              content: '옛 세대 전송',
              status: 'unconfirmed',
            },
          ],
        },
      }),
    )
    expect(await within(thread).findByText('옛 세대 전송')).toBeInTheDocument()

    // 이력은 새 세대(3)를 돌려주고, 방 목록은 아직 옛 세대(2)다.
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({
          messages: [msg(10)],
          nextCursor: null,
          participationVersion: MY_VERSION + 1,
          visibleFromSequence: 10,
        }),
      ),
    )
    await act(() =>
      queryClient.refetchQueries({ queryKey: ['chat', 'messages', 5] }),
    )
    await settle()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
  })

  it('새 세대 이력이 방 목록보다 먼저 오면 바로 하한을 올려, 늦은 옛 세대 프레임을 받지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { thread, client } = await openRoom('순번 3')
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({
          messages: [msg(10)],
          nextCursor: null,
          participationVersion: MY_VERSION + 1,
          visibleFromSequence: 10,
        }),
      ),
    )
    await act(() =>
      queryClient.refetchQueries({ queryKey: ['chat', 'messages', 5] }),
    )
    expect(await within(thread).findByText('순번 10')).toBeInTheDocument()

    // 방 목록은 아직 옛 세대(2)다. 늦게 온 옛 세대 프레임은 새 이력에 섞이지 않는다.
    push(
      client,
      { ...msg(4), content: '늦은 옛 세대' },
      { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION) },
    )
    await settle()
    expect(within(thread).queryByText('늦은 옛 세대')).toBeNull()
  })

  it('이력을 한 번도 받지 못해도 방 목록이 새 세대를 알려 주면 옛 세대 보내는 중 표시를 버린다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    await openRoom('순번 3')
    act(() =>
      useChatStore.setState({
        pending: {
          5: [
            {
              clientMessageId: 'old',
              content: '옛 세대 전송',
              status: 'unconfirmed',
            },
          ],
        },
      }),
    )
    // 이후 이력 조회는 계속 실패하고, 방 목록은 새 세대(3)를 알려 준다.
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', detail: '실패' },
          { status: 500 },
        ),
      ),
      http.get('*/api/v1/chats', () => rs([roomV(MY_VERSION + 1)])),
    )
    await act(() => queryClient.refetchQueries({ queryKey: ['chat', 'rooms'] }))
    await advance(10_000)
    await settle()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
  })

  it('방 목록 요청이 끝나지 않아도 시간 상한 뒤 다음 재동기화가 방 목록을 다시 부른다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { client } = await openRoom('순번 3')
    let roomCalls = 0
    let hang = true
    server.use(
      http.get('*/api/v1/chats', async () => {
        roomCalls++
        if (hang) await new Promise(() => {})
        return rs([room()])
      }),
    )
    const resync = () =>
      act(() =>
        client.push('/user/queue/chats/sync', {
          type: 'RESYNC',
          reason: 'X',
          occurredAt: '2026-10-29T10:00:00',
        }),
      )
    resync()
    await waitFor(() => expect(roomCalls).toBe(1))
    await advance(RECEIPT_POLICY.reconcile.runTimeoutMs + 100)
    hang = false
    resync()
    await waitFor(() => expect(roomCalls).toBe(2))
    await settle()
  })

  it('새 세대 이력을 받는 동안 보관한 옛 세대 프레임은 새 이력에 합치지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { thread, client } = await openRoom('순번 3')
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        await gate
        return rs({
          messages: [msg(10)],
          nextCursor: null,
          participationVersion: MY_VERSION + 1,
          visibleFromSequence: 10,
        })
      }),
    )
    const refetch = act(() =>
      queryClient.refetchQueries({ queryKey: ['chat', 'messages', 5] }),
    )
    // 조회 중에 아직 옛 세대(2)인 프레임이 와서 보관된다.
    push(
      client,
      { ...msg(4), content: '보관된 옛 세대' },
      { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION) },
    )
    release()
    await refetch
    expect(await within(thread).findByText('순번 10')).toBeInTheDocument()
    await settle()
    expect(within(thread).queryByText('보관된 옛 세대')).toBeNull()
  })

  it('이전 메시지 응답이 새 세대를 알려 주면 옛 이력에 붙이지 않고 옛 상태를 버린 뒤 최신부터 다시 받는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 40))
    const { thread } = await openRoom('순번 40')
    let latestCalls = 0
    act(() =>
      useChatStore.setState({
        pending: {
          5: [
            {
              clientMessageId: 'old',
              content: '옛 세대 전송',
              status: 'unconfirmed',
            },
          ],
        },
      }),
    )
    server.use(
      http.get('*/api/v1/chats/5/messages', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        return cursor
          ? rs({
              messages: [{ ...msg(5), content: '새 세대의 이전 메시지' }],
              nextCursor: null,
              participationVersion: MY_VERSION + 1,
            })
          : (latestCalls++,
            rs({
              messages: [msg(50)],
              nextCursor: null,
              participationVersion: MY_VERSION + 1,
            }))
      }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: '이전 메시지 더 보기' }),
    )
    await advance(5_000)
    await settle()
    expect(within(thread).queryByText('새 세대의 이전 메시지')).toBeNull()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
    // 최신 페이지부터 새 세대 이력을 다시 받았다.
    expect(latestCalls).toBeGreaterThan(0)
    expect(within(thread).getByText('순번 50')).toBeInTheDocument()
  })

  it('이력 캐시가 지워진 뒤 받은 실시간 메시지는 확인하지 않는다', async () => {
    const acks = fakeAckTransport()
    mockServer(range(1, 3))
    const router = renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await within(thread).findByText('순번 3')
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    const client = FakeStompClient.latest()!
    act(() => client.connect())
    await settle()
    await passAckWait()
    expect(acks.at(-1)?.receivedSequence).toBe(3)

    // 연결은 그대로 둔 채 대화 목록으로 나가 이력 캐시가 정리됐다.
    await act(() => router.navigate('/chat'))
    act(() => queryClient.removeQueries({ queryKey: ['chat', 'messages', 5] }))
    push(client, msg(4))
    await passAckWait()
    await settle()
    expect(acks.every((a) => a.receivedSequence <= 3)).toBe(true)
  })

  it('첫 이력 요청이 대조 시간 상한에 걸려 끊기면, 서버가 회복된 뒤 다시 불러온다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    let hang = true
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        if (hang) await new Promise(() => {})
        return rs({ messages: [3, 2, 1].map(msg), nextCursor: null })
      }),
    )
    renderApp('/chat/5', 'INFLUENCER')
    const thread = await screen.findByRole('region', { name: /님과의 대화/ })
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    act(() => FakeStompClient.latest()!.connect())
    hang = true
    await advance(RECEIPT_POLICY.reconcile.runTimeoutMs + 500)
    hang = false
    const { intervalMs, jitterRatio } = RECEIPT_POLICY.reconcile
    await advance(intervalMs * (1 + jitterRatio) + 100)
    expect(await within(thread).findByText('순번 3')).toBeInTheDocument()
    await settle()
  })

  it('최초 연결 시도만 바로 하고, 그 뒤의 재시도(최초 연결 실패 포함)는 무작위로 기다린다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    renderApp('/chat/5', 'INFLUENCER')
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    const config = FakeStompClient.latest()!.config as {
      beforeConnect?: () => Promise<void> | undefined
    }
    expect(config.beforeConnect?.()).toBeUndefined()
    // 연결에 성공하지 못한 채 다시 시도해도 무작위로 기다린다.
    expect(config.beforeConnect?.()).toBeInstanceOf(Promise)
    await settle()
  })

  it('대조 응답을 기다리는 사이 이력 캐시가 지워지고 새로 만들어지면, 늦은 대조 응답으로 새 캐시에 없는 구간을 확인하지 않는다', async () => {
    const acks = fakeAckTransport()
    mockServer(range(1, 3))
    const router = renderApp('/chat/5', 'INFLUENCER')
    const firstThread = await screen.findByRole('region', {
      name: /님과의 대화/,
    })
    await within(firstThread).findByText('순번 3')
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    const client = FakeStompClient.latest()!
    act(() => client.connect())
    await settle()
    await passAckWait()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let calls = 0
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        calls++
        // 첫 요청(대조)은 붙잡혔다가 4까지 담아 돌아온다. 그 뒤 새 캐시의 요청은 3까지만 바로 돌려준다.
        if (calls === 1) {
          await gate
          return rs({ messages: [4, 3, 2, 1].map(msg), nextCursor: null })
        }
        return rs({ messages: [3, 2, 1].map(msg), nextCursor: null })
      }),
    )
    act(() =>
      client.push('/user/queue/chats/sync', {
        type: 'RESYNC',
        reason: 'X',
        occurredAt: '2026-10-29T10:00:00',
      }),
    )
    await waitFor(() => expect(calls).toBe(1))
    // 연결은 그대로인 채 대화를 나갔다 오며 이력 캐시가 지워졌다가 새로 만들어진다(새 캐시에는 4가 없다).
    await act(() => router.navigate('/chat'))
    act(() => queryClient.removeQueries({ queryKey: ['chat', 'messages', 5] }))
    await act(() => router.navigate('/chat/5'))
    await waitFor(() => expect(calls).toBeGreaterThan(1))
    await settle()
    release()
    await passAckWait()
    await settle()
    expect(acks.every((a) => a.receivedSequence <= 3)).toBe(true)
  })

  it('서비스를 만들기 전부터 캐시에 있던 세대를 기준으로, 더 높은 세대 프레임이 오면 옛 세대 상태를 버린다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 3))
    // 채팅 연결을 맺기 전에 방 목록·이력·보내는 중 표시가 이미 세대 2로 있다(재연결 등).
    queryClient.setQueryData(['chat', 'rooms'], [room()])
    useChatStore.setState({
      pending: {
        5: [
          {
            clientMessageId: 'old',
            content: '옛 세대 전송',
            status: 'unconfirmed',
          },
        ],
      },
    })
    const { client } = await openRoom('순번 3')
    const before = state.roomCalls
    push(client, msg(9), {
      [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION + 1),
    })
    await settle()
    expect(useChatStore.getState().pending[5]).toBeUndefined()
    expect(state.roomCalls).toBeGreaterThan(before)
  })

  it('새 세대로 바꾸던 이력 조회가 취소되면(이전 데이터로 되돌림) 옛 세대 대화를 남기지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 40))
    const { thread } = await openRoom('순번 40')
    await userEvent.click(
      await screen.findByRole('button', { name: '이전 메시지 더 보기' }),
    )
    await within(thread).findByText('순번 1')
    server.use(
      http.get('*/api/v1/chats/5/messages', async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (cursor !== null) await new Promise(() => {})
        return rs({
          messages: [msg(60)],
          nextCursor: 60,
          participationVersion: MY_VERSION + 1,
        })
      }),
    )
    const refetch = queryClient
      .refetchQueries({ queryKey: ['chat', 'messages', 5] })
      .catch(() => undefined)
    await advance(1_000)
    await act(() =>
      queryClient.cancelQueries({ queryKey: ['chat', 'messages', 5] }),
    )
    await refetch
    await advance(1_000)
    expect(within(thread).queryByText('순번 1')).toBeNull()
  })

  it('대조 응답이 새 세대를 알려 주면 방 목록이 늦어도 하한을 올려 늦은 옛 세대 프레임을 받지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { thread, client } = await openRoom('순번 3')
    server.use(
      http.get('*/api/v1/chats/5/messages', () =>
        rs({
          messages: [msg(10)],
          nextCursor: null,
          participationVersion: MY_VERSION + 1,
        }),
      ),
      // 방 목록 갱신은 계속 실패한다.
      http.get('*/api/v1/chats', () =>
        HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', detail: '실패' },
          { status: 500 },
        ),
      ),
    )
    act(() =>
      client.push('/user/queue/chats/sync', {
        type: 'RESYNC',
        reason: 'X',
        occurredAt: '2026-10-29T10:00:00',
      }),
    )
    await advance(5_000)
    push(
      client,
      { ...msg(4), content: '늦은 옛 세대' },
      { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION) },
    )
    await advance(5_000)
    expect(within(thread).queryByText('늦은 옛 세대')).toBeNull()
    await settle()
  })

  it('새 세대로 바꾸던 이력 조회가 이전 페이지에서 실패해도, 새 세대를 안 뒤 보낸 메시지의 보내는 중 표시는 남긴다', async () => {
    fakeAckTransport()
    mockServer(range(1, 40))
    const { thread } = await openRoom('순번 40')
    await userEvent.click(
      await screen.findByRole('button', { name: '이전 메시지 더 보기' }),
    )
    await within(thread).findByText('순번 1')
    let failOlder: (() => void) | null = null
    let olderCalls = 0
    server.use(
      http.get('*/api/v1/chats/5/messages', async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (cursor !== null) {
          // 첫 이전 페이지 요청만 붙잡았다가 실패시킨다.
          if (olderCalls++ === 0)
            await new Promise<void>((resolve) => (failOlder = resolve))
          return HttpResponse.json(
            { status: 500, code: 'INTERNAL_ERROR', detail: '실패' },
            { status: 500 },
          )
        }
        return rs({
          messages: [msg(60)],
          nextCursor: 60,
          participationVersion: MY_VERSION + 1,
        })
      }),
    )
    const refetching = queryClient
      .refetchQueries({ queryKey: ['chat', 'messages', 5] })
      .catch(() => undefined)
    // 최신 페이지가 새 세대를 알린 뒤(옛 세대 보내는 중 표시는 이때 버린다) 새 세대에서 메시지를 보냈다.
    await waitFor(() => expect(failOlder).not.toBeNull())
    act(() =>
      useChatStore.setState({
        pending: {
          5: [
            {
              clientMessageId: 'new-gen',
              content: '새 세대 전송',
              status: 'sending',
            },
          ],
        },
      }),
    )
    act(() => failOlder!())
    await act(() => refetching)
    await advance(10_000)
    await settle()
    expect(within(thread).queryByText('순번 40')).toBeNull()
    expect(
      useChatStore.getState().pending[5]?.map((p) => p.clientMessageId),
    ).toEqual(['new-gen'])
  })

  it('새 세대로 바꾸던 이력 조회가 이전 페이지에서 실패하면 옛 세대 대화를 남기지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 40))
    const { thread } = await openRoom('순번 40')
    await userEvent.click(
      await screen.findByRole('button', { name: '이전 메시지 더 보기' }),
    )
    await within(thread).findByText('순번 1')
    server.use(
      http.get('*/api/v1/chats/5/messages', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (cursor !== null)
          return HttpResponse.json(
            { status: 500, code: 'INTERNAL_ERROR', detail: '실패' },
            { status: 500 },
          )
        return rs({
          messages: [msg(60)],
          nextCursor: 60,
          participationVersion: MY_VERSION + 1,
        })
      }),
    )
    await act(() =>
      queryClient
        .refetchQueries({ queryKey: ['chat', 'messages', 5] })
        .catch(() => undefined),
    )
    await advance(10_000)
    await settle()
    expect(within(thread).queryByText('순번 40')).toBeNull()
    expect(within(thread).queryByText('순번 1')).toBeNull()
  })

  it('대조 요청이 끝나지 않아도 시간 상한 뒤 다음 재동기화가 다시 대조한다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')
    let hang = true
    server.use(
      http.get('*/api/v1/chats/5/messages', async () => {
        if (hang) await new Promise(() => {})
        return rs({
          messages: range(1, 6).reverse().map(msg),
          nextCursor: null,
        })
      }),
    )
    state.saved = range(1, 6)
    const resync = () =>
      act(() =>
        client.push('/user/queue/chats/sync', {
          type: 'RESYNC',
          reason: 'X',
          occurredAt: '2026-10-29T10:00:00',
        }),
      )
    resync()
    await advance(RECEIPT_POLICY.reconcile.runTimeoutMs + 100)
    hang = false
    resync()
    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    await settle()
  })
})

describe('참여 세대가 맞지 않는 실시간 응답', () => {
  it('수신자 참여 세대가 지금 세대보다 낮으면 적용하지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 3))
    const { thread, client } = await openRoom('순번 3')

    push(
      client,
      { ...msg(4), content: '옛 세대 응답' },
      { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION - 1) },
    )
    push(client, msg(4), { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION) })
    expect(await within(thread).findByText('순번 4')).toBeInTheDocument()
    expect(within(thread).queryByText('옛 세대 응답')).toBeNull()
    await settle()
  })

  it('더 높으면(다른 곳에서 재입장) 옛 세대 이력을 버리고 방 목록·이력을 새 세대로 다시 받는다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 3))
    const { thread, client } = await openRoom('순번 3')
    const before = { ...state }

    push(
      client,
      { ...msg(4), content: '새 세대 메시지' },
      { [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION + 1) },
    )
    await settle()
    expect(state.roomCalls).toBeGreaterThan(before.roomCalls)
    expect(state.historyCalls).toBeGreaterThan(before.historyCalls)
    // 이 프레임은 그대로 적용하지 않는다(새 세대 이력에서 받는다).
    expect(within(thread).queryByText('새 세대 메시지')).toBeNull()
  })
})

describe('순번 간격 유예 (프레임 순서 비보장, BE #419)', () => {
  const { graceMs } = RECEIPT_POLICY.gap

  it('순서가 뒤바뀌어 7이 6보다 먼저 와도 유예 안에 6이 오면 이력·방 목록을 다시 부르지 않는다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')
    const before = { ...state }

    state.saved = range(1, 7)
    push(client, msg(7))
    await advance(graceMs / 2)
    push(client, msg(6))
    await advance(graceMs * 3)
    await settle()
    expect(state.historyCalls).toBe(before.historyCalls)
    expect(state.roomCalls).toBe(before.roomCalls)
    expect(
      within(thread)
        .getAllByText(/^순번 [5-7]$/)
        .map((b) => b.textContent),
    ).toEqual(['순번 5', '순번 6', '순번 7'])
  })

  it('실제로 빠졌으면 유예 전에는 부르지 않고, 유예 뒤 방 목록 다음 그 방 이력을 읽어 채운다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')
    const order: string[] = []
    const onRequest = ({ request }: { request: Request }) => {
      const { pathname } = new URL(request.url)
      if (pathname.endsWith('/api/v1/chats')) order.push('rooms')
      if (pathname.endsWith('/chats/5/messages')) order.push('history')
    }
    server.events.on('request:start', onRequest)
    onTestFinished(() =>
      server.events.removeListener('request:start', onRequest),
    )

    state.saved = range(1, 7)
    push(client, msg(7))
    await advance(graceMs / 2)
    expect(order).toEqual([])
    await advance(graceMs)
    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    await settle()
    expect(order[0]).toBe('rooms')
    expect(order).toContain('history')
  })

  it('간격을 기다리는 동안 이력 캐시가 지워지면(나가기 등) 대조하지 않는다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { client } = await openRoom('순번 5')

    push(client, msg(7))
    cleanup()
    act(() => queryClient.removeQueries({ queryKey: chatKeys.messages(5) }))
    const after = { ...state }
    await advance(graceMs + 200)
    await settle()
    expect(state.historyCalls).toBe(after.historyCalls)
  })

  it('서버에도 없는 순번(숨김 등)이면 유예 뒤 한 번만 대조하고 계속 부르지 않는다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')
    const before = { ...state }

    state.saved = [...range(1, 5), 7]
    push(client, msg(7))
    expect(await within(thread).findByText('순번 7')).toBeInTheDocument()
    await advance(graceMs + 100)
    await settle()
    expect(state.roomCalls).toBe(before.roomCalls + 1)
    expect(state.historyCalls).toBeGreaterThan(before.historyCalls)
    const afterReconcile = { ...state }

    await advance(graceMs * 5)
    await settle()
    expect(state.historyCalls).toBe(afterReconcile.historyCalls)
    expect(state.roomCalls).toBe(afterReconcile.roomCalls)
  })

  it('간격을 기다리는 동안 참여 세대가 바뀌면 옛 세대 간격으로는 대조하지 않는다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { client } = await openRoom('순번 5')

    push(client, msg(7))
    // 다른 곳에서 재입장했다: 옛 세대 이력과 함께 기다리던 간격도 버린다.
    push(client, msg(8), {
      [PARTICIPATION_VERSION_HEADER]: String(MY_VERSION + 1),
    })
    await settle()
    const afterSwitch = { ...state }

    await advance(graceMs + 100)
    await settle()
    expect(state.historyCalls).toBe(afterSwitch.historyCalls)
    expect(state.roomCalls).toBe(afterSwitch.roomCalls)
  })
})

describe('읽음 뒤에 늦게 온 방 목록 응답', () => {
  /** 다음 방 목록 응답을 붙잡는다. 응답 내용은 snapshot이다 */
  function holdRooms(snapshot: ChatRoom) {
    const held: { release: (() => void) | null } = { release: null }
    server.use(
      http.get(
        '*/api/v1/chats',
        async () => {
          await new Promise<void>((resolve) => (held.release = resolve))
          return rs([snapshot])
        },
        { once: true },
      ),
    )
    return held
  }

  it('읽음 전에 만들어진 응답이 읽음 확인 뒤 도착해도 이미 읽은 방의 안 읽은 수를 되살리지 않는다', async () => {
    fakeAckTransport()
    mockServer(range(1, 5))
    const reads: number[] = []
    server.use(
      http.put('*/api/v1/chats/5/read', async ({ request }) => {
        reads.push(
          ((await request.json()) as { lastReadSequence: number })
            .lastReadSequence,
        )
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { thread, client } = await openRoom('순번 5')
    // 6을 읽기 전에 시작한 방 목록 재조회(다른 경로의 재조회·대조)가 늦게 끝난다.
    const held = holdRooms(room({ lastMessage: msg(6), unreadCount: 1 }))
    const refetching = queryClient.invalidateQueries({
      queryKey: chatKeys.rooms(),
    })
    await waitFor(() => expect(held.release).not.toBeNull())
    push(client, msg(6))
    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    await waitFor(() => expect(reads).toContain(6))

    act(() => held.release!())
    await act(() => refetching)
    await settle()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    await waitFor(() =>
      expect(within(nav).queryByLabelText(/안 읽은 메시지/)).toBeNull(),
    )
  })

  it('응답의 마지막 메시지가 읽음 확인보다 새로우면 안 읽은 수를 그대로 둔다', async () => {
    fakeAckTransport()
    mockServer(range(1, 5))
    const hasFocus = vi.spyOn(document, 'hasFocus')
    onTestFinished(() => hasFocus.mockRestore())
    await openRoom('순번 5')
    // 탭이 가려진 동안(읽음 미룸) 서버에 6이 왔다.
    hasFocus.mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    const held = holdRooms(room({ lastMessage: msg(6), unreadCount: 1 }))
    const refetching = queryClient.invalidateQueries({
      queryKey: chatKeys.rooms(),
    })
    await waitFor(() => expect(held.release).not.toBeNull())
    act(() => held.release!())
    await act(() => refetching)
    await settle()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(
      await within(nav).findByLabelText('안 읽은 메시지 1개'),
    ).toBeInTheDocument()
  })
})

describe('재동기화 처리 순서 (계약 (e))', () => {
  it('주기 대조도 방 목록 응답이 끝난 뒤에 방 이력을 대조한다', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    await openRoom('순번 5')
    state.saved = range(1, 6)
    const order: string[] = []
    let releaseRooms!: () => void
    server.use(
      http.get('*/api/v1/chats', async () => {
        order.push('rooms')
        await new Promise<void>((resolve) => (releaseRooms = resolve))
        return rs([room({ lastMessage: msg(6) })])
      }),
      http.get('*/api/v1/chats/5/messages', () => {
        order.push('history')
        return rs({
          messages: range(1, 6).reverse().map(msg),
          nextCursor: null,
        })
      }),
    )
    const { intervalMs, jitterRatio } = RECEIPT_POLICY.reconcile
    await advance(intervalMs * (1 + jitterRatio) + 100)
    await waitFor(() => expect(order).toContain('rooms'))
    await advance(1_000)
    expect(order).not.toContain('history')

    act(() => releaseRooms())
    await waitFor(() => expect(order).toContain('history'))
    await settle()
  })

  it('방 목록 응답이 끝난 뒤에 열어 둔 방을 대조한다(대조로 채워 읽은 방의 안 읽은 수가 늦은 방 목록으로 되살아나지 않게)', async () => {
    fakeAckTransport()
    const state = mockServer(range(1, 5))
    const { thread, client } = await openRoom('순번 5')

    // 서버에는 6이 저장됐다. 재동기화 뒤의 방 목록 응답은 읽기 전 상태(안 읽은 1)로 만들어져 늦게 온다.
    state.saved = range(1, 6)
    let releaseRooms!: () => void
    const order: string[] = []
    server.use(
      http.get('*/api/v1/chats', async () => {
        order.push('rooms')
        const snapshot = room({ lastMessage: msg(6), unreadCount: 1 })
        await new Promise<void>((resolve) => (releaseRooms = resolve))
        return rs([snapshot])
      }),
      http.get('*/api/v1/chats/5/messages', () => {
        order.push('history')
        return rs({
          messages: range(1, 6).reverse().map(msg),
          nextCursor: null,
        })
      }),
    )
    act(() =>
      client.push('/user/queue/chats/sync', {
        type: 'RESYNC',
        reason: 'DELIVERY_DROPPED',
        occurredAt: '2026-10-29T10:00:00',
      }),
    )
    await waitFor(() => expect(order).toEqual(['rooms']))
    await advance(1_000)
    // 방 목록이 끝나기 전에는 이력을 대조하지 않는다.
    expect(order).toEqual(['rooms'])

    act(() => releaseRooms())
    expect(await within(thread).findByText('순번 6')).toBeInTheDocument()
    expect(order.slice(0, 2)).toEqual(['rooms', 'history'])
    await settle()
    // 보고 있는 방이라 대조로 채운 6을 읽음 처리했고, 앞선 방 목록 응답이 안 읽은 수를 되살리지 않는다.
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    await waitFor(() =>
      expect(within(nav).queryByLabelText(/안 읽은 메시지/)).toBeNull(),
    )
  })
})
