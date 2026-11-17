import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { notificationKeys } from '@/entities/notification/api'
import type { NotificationItem } from '@/entities/notification/types'
import { getAccessToken, setAccessToken } from '@/shared/auth/token'
import { meQuery } from '@/shared/auth/me'
import type { Viewer } from '@/shared/auth/role'
import { closeLoginModal } from '@/shared/ui/loginModal'
import {
  CHAT_WS_PATH,
  FakeStompClient,
  NOTIFICATION_WS_PATH,
} from '@/test/fakeStomp'
import {
  headerAlertsLink,
  mockNotifications,
  mockNotificationTickets,
  notification,
} from '@/test/notificationMock'
import { renderApp, rs, TEST_ACCESS_TOKEN } from '@/test/renderApp'
import { server } from '@/test/server'

const QUEUE = '/user/queue/notifications'

const channels: BroadcastChannel[] = []

afterEach(() => {
  channels.splice(0).forEach((c) => c.close())
  vi.useRealTimers()
  queryClient.clear()
  closeLoginModal()
})

/** 만들어진 알림 연결(티켓을 받기 전일 수 있다) */
async function notificationClient() {
  await waitFor(() =>
    expect(FakeStompClient.latest(NOTIFICATION_WS_PATH)).toBeDefined(),
  )
  return FakeStompClient.latest(NOTIFICATION_WS_PATH)!
}

/** 티켓을 받아 연결하고, 연결 직후 다시 읽기가 끝날 때까지 기다린다(그 뒤에 프레임을 보낸다) */
async function connect(client: FakeStompClient) {
  await act(() => client.ready)
  act(() => client.connect())
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
}

/** stompjs가 다시 연결할 때처럼 새 티켓을 받는다 */
const reconnect = (client: FakeStompClient) =>
  act(() => client.config.beforeConnect!(client))

const push = (
  client: FakeStompClient,
  item: NotificationItem,
  unreadCount: number,
) => act(() => client.push(QUEUE, { notification: item, unreadCount }))

const urlOf = (client: FakeStompClient) => new URL(client.brokerURL!)

/** 알림 목록 화면의 항목 문구(위에서부터, 안 읽은 알림만 쓴다) */
async function listedMessages() {
  const panel = await screen.findByRole('region', { name: '알림 목록' })
  return within(panel)
    .getAllByRole('button')
    .map((b) => b.querySelector('b')?.textContent)
}

/** 가짜로 바꾸기 전의 setTimeout(가짜 시계를 쓰는 동안 진짜 시간으로 기다릴 때 쓴다) */
const realSetTimeout = globalThis.setTimeout

/**
 * 진짜 시간으로 조금씩 기다리며 조건을 확인한다(가짜 시계는 움직이지 않는다). setTimeout을 가짜로 둔 동안에는
 * Testing Library의 waitFor(안에서 setTimeout을 쓴다)가 끝나지 않아 이것을 쓴다.
 */
async function until(check: () => boolean) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > 5_000)
      throw new Error('기다리던 상태가 되지 않았다')
    await new Promise((resolve) => realSetTimeout(resolve, 1))
  }
}

/** 재발급 응답과 횟수(토큰은 fresh-<횟수>) */
function mockRefresh() {
  const state = { calls: 0 }
  server.use(
    http.post('*/api/v1/members/auth/refresh', () => {
      state.calls++
      return rs({ accessToken: `fresh-${state.calls}`, expiresIn: 900 })
    }),
  )
  return state
}

describe('알림 실시간 연결', () => {
  it('회원은 일회용 티켓을 주소에 싣고 연결해 내 알림만 구독한다. CONNECT에는 토큰을 넣지 않고 heart-beat를 켠다', async () => {
    mockNotifications([])
    renderApp('/lectures', 'USER')
    const tickets = mockNotificationTickets()
    const client = await notificationClient()
    await connect(client)

    expect(tickets.authorizations).toEqual([`Bearer ${TEST_ACCESS_TOKEN}`])
    expect(urlOf(client).pathname).toBe('/api/v1/notifications/ws')
    expect(urlOf(client).searchParams.get('ticket')).toBe('n-1')
    expect(client.connectHeaders).toEqual({})
    expect(client.config.heartbeatIncoming).toBeGreaterThan(0)
    expect(client.config.heartbeatOutgoing).toBeGreaterThan(0)
    expect(client.subscriptions.map((s) => s.destination)).toEqual([QUEUE])
    expect(client.published).toEqual([])
  })

  it('인플루언서는 채팅 연결과 따로 알림 연결을 맺는다', async () => {
    renderApp('/lectures', 'INFLUENCER')
    await notificationClient()
    await waitFor(() =>
      expect(FakeStompClient.on(CHAT_WS_PATH)).toHaveLength(1),
    )
    expect(FakeStompClient.on(NOTIFICATION_WS_PATH)).toHaveLength(1)
  })

  it.each<[string, Viewer, string]>([
    ['관리자', 'ADMIN', '/admin'],
    ['비회원', 'GUEST', '/lectures'],
  ])('%s는 티켓을 받지 않고 연결하지 않는다', async (_, viewer, path) => {
    const tickets = mockNotificationTickets()
    renderApp(path, viewer)
    await screen.findByRole('banner')
    await new Promise((r) => setTimeout(r, 50))
    expect(FakeStompClient.on(NOTIFICATION_WS_PATH)).toHaveLength(0)
    expect(tickets.calls).toBe(0)
  })

  it('다른 탭에서 로그아웃하면 연결을 닫는다', async () => {
    renderApp('/lectures', 'USER')
    const client = await notificationClient()
    await connect(client)

    const channel = new BroadcastChannel('hapbang.auth')
    channels.push(channel)
    act(() => channel.postMessage({ type: 'logout' }))

    await waitFor(() => expect(client.active).toBe(false))
    expect(getAccessToken()).toBeNull()
  })

  it('이 탭에서 로그아웃하면 연결을 닫고 다시 맺지 않는다', async () => {
    renderApp('/lectures', 'USER')
    const client = await notificationClient()
    await connect(client)

    const shell = await screen.findByRole('banner')
    await userEvent.click(
      within(shell).getByRole('button', { name: '하늘 메뉴' }),
    )
    await userEvent.click(
      within(shell).getByRole('button', { name: '로그아웃' }),
    )

    await waitFor(() => expect(client.active).toBe(false))
    expect(FakeStompClient.on(NOTIFICATION_WS_PATH)).toHaveLength(1)
  })
})

describe('새 알림 프레임', () => {
  it('받으면 헤더 배지와 목록 맨 앞이 새로고침 없이 바뀐다', async () => {
    mockNotifications([notification(1)])
    renderApp('/alerts', 'USER')
    await waitFor(() =>
      expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 1개'),
    )
    const client = await notificationClient()
    await connect(client)

    push(client, notification(2, { message: '하늘님이 출연을 요청했어요.' }), 2)

    await waitFor(() =>
      expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 2개'),
    )
    expect(await listedMessages()).toEqual([
      '하늘님이 출연을 요청했어요.',
      '알림 1',
    ])
  })

  it('같은 ID의 알림은 하나로 남고, 새 값으로 바뀌어 맨 앞으로 온다', async () => {
    mockNotifications([
      notification(2),
      notification(1, { message: '강의 수익 1건이 지급되었습니다.' }),
    ])
    renderApp('/alerts', 'USER')
    const client = await notificationClient()
    await connect(client)
    expect(await listedMessages()).toEqual([
      '알림 2',
      '강의 수익 1건이 지급되었습니다.',
    ])

    push(
      client,
      notification(1, { message: '강의 수익 2건이 지급되었습니다.' }),
      2,
    )

    await waitFor(async () =>
      expect(await listedMessages()).toEqual([
        '강의 수익 2건이 지급되었습니다.',
        '알림 2',
      ]),
    )
  })

  it('목록은 20개를 넘기지 않는다(가장 오래된 알림이 빠진다)', async () => {
    mockNotifications(
      Array.from({ length: 20 }, (_, i) => notification(20 - i)),
    )
    renderApp('/alerts', 'USER')
    const client = await notificationClient()
    await connect(client)

    push(client, notification(21), 20)

    await waitFor(async () => expect(await listedMessages()).toHaveLength(20))
    const messages = await listedMessages()
    expect(messages[0]).toBe('알림 21')
    expect(messages).not.toContain('알림 1')
  })

  it('다시 읽는 중에 온 프레임은 늦게 도착한 옛 응답에 덮이지 않는다', async () => {
    let hold: Promise<void> | undefined
    const calls = mockNotifications([notification(1)], { hold: () => hold })
    renderApp('/alerts', 'USER')
    expect(await listedMessages()).toEqual(['알림 1'])
    const client = await notificationClient()
    await act(() => client.ready)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const before = { list: calls.listCount(), count: calls.unreadCountCount() }

    // 연결 직후 다시 읽기의 응답(새 알림 전의 값)을 늦춘다.
    let answer!: () => void
    hold = new Promise<void>((r) => (answer = r))
    act(() => client.connect())
    await waitFor(() => {
      expect(calls.listCount()).toBe(before.list + 1)
      expect(calls.unreadCountCount()).toBe(before.count + 1)
    })
    hold = undefined
    // BE가 새 알림을 저장(commit)한 뒤 프레임을 보낸다.
    const item = notification(2, { message: '하늘님이 출연을 요청했어요.' })
    calls.save(item)
    push(client, item, 2)
    act(() => answer())

    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(await listedMessages()).toEqual([
      '하늘님이 출연을 요청했어요.',
      '알림 1',
    ])
    expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 2개')
  })

  it('목록을 아직 불러오지 않았으면 안 읽은 수만 바꾼다', async () => {
    mockNotifications([])
    renderApp('/lectures', 'USER')
    const client = await notificationClient()
    await connect(client)

    push(client, notification(1), 1)

    await waitFor(() =>
      expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 1개'),
    )
    expect(queryClient.getQueryData(notificationKeys.list())).toBeUndefined()
  })

  it('계약과 다른 모양의 프레임은 버린다', async () => {
    mockNotifications([notification(1)])
    renderApp('/alerts', 'USER')
    const client = await notificationClient()
    await connect(client)

    act(() => client.push(QUEUE, { statusCode: 200, data: notification(2) }))

    expect(await listedMessages()).toEqual(['알림 1'])
    expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 1개')
  })
})

describe('끊김과 다시 연결', () => {
  it('연결할 때와 끊긴 뒤(핸드셰이크 거절 포함) 새 티켓으로 다시 연결할 때마다 목록과 안 읽은 수를 다시 읽는다', async () => {
    const calls = mockNotifications([notification(1)])
    renderApp('/alerts', 'USER')
    const tickets = mockNotificationTickets()
    await screen.findByRole('region', { name: '알림 목록' })
    const client = await notificationClient()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const before = { list: calls.listCount(), count: calls.unreadCountCount() }

    await connect(client)
    expect(calls.listCount()).toBe(before.list + 1)
    expect(calls.unreadCountCount()).toBe(before.count + 1)

    // 비정상 종료(티켓 401로 핸드셰이크가 거절되면 브라우저에는 1006으로 보인다)
    act(() => client.disconnect({ code: 1006 }))
    expect(client.active).toBe(true)
    await reconnect(client)
    expect(urlOf(client).searchParams.get('ticket')).toBe('n-2')
    await connect(client)

    expect(tickets.calls).toBe(2)
    expect(calls.listCount()).toBe(before.list + 2)
    expect(calls.unreadCountCount()).toBe(before.count + 2)
  })

  it('연결 만료(4401)로 닫히면 토큰을 확인해 다시 받고, 새 티켓으로 다시 연결한다', async () => {
    const calls = mockNotifications([])
    renderApp('/alerts', 'USER')
    const tickets = mockNotificationTickets()
    const client = await notificationClient()
    await connect(client)
    const refresh = mockRefresh()
    const listed = calls.listCount()

    // 연결 만료는 토큰 만료에 맞춰져 있어 닫힐 때 토큰도 거의 끝났다.
    setAccessToken('almost-expired', 5)
    act(() => client.disconnect({ code: 4401, reason: 'TOKEN_EXPIRED' }))
    expect(client.active).toBe(true)
    await reconnect(client)

    expect(refresh.calls).toBe(1)
    expect(tickets.authorizations.at(-1)).toBe('Bearer fresh-1')
    expect(urlOf(client).searchParams.get('ticket')).toBe('n-2')
    await connect(client)
    expect(calls.listCount()).toBe(listed + 1)
  })

  it('받은 티켓의 연결 만료가 이미 지났으면 토큰부터 새로 받아 티켓을 다시 받는다', async () => {
    renderApp('/lectures', 'USER')
    const refresh = mockRefresh()
    const tickets = mockNotificationTickets((call) =>
      call === 1
        ? { connectionExpiresAt: new Date(Date.now() - 1_000).toISOString() }
        : null,
    )
    const client = await notificationClient()
    await act(() => client.ready)

    expect(refresh.calls).toBe(1)
    expect(tickets.calls).toBe(2)
    expect(tickets.authorizations).toEqual([
      `Bearer ${TEST_ACCESS_TOKEN}`,
      'Bearer fresh-1',
    ])
    expect(urlOf(client).searchParams.get('ticket')).toBe('n-2')
  })

  it.each<[string, number | 'network']>([
    ['횟수 제한(429)', 429],
    ['티켓 저장소 장애(503)', 503],
    ['응답 없음', 'network'],
  ])(
    '티켓을 받지 못하면(%s) 채팅과 같은 간격으로 기다렸다 다시 받는다',
    async (_, failure) => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      let answerFirst!: () => void
      const firstAnswered = new Promise<void>((r) => (answerFirst = r))
      renderApp('/lectures', 'USER')
      const tickets = mockNotificationTickets(async (call) => {
        if (call === 1) await firstAnswered
        return call <= 2 ? failure : null
      })
      const client = await notificationClient()
      await waitFor(() => expect(tickets.calls).toBe(1))

      // 첫 실패를 돌려주기 전에 setTimeout만 가짜로 바꾼다. 그 뒤의 재시도 대기는 모두 가짜 시계에 잡히고, 가짜
      // 시계는 아래에서 움직인 만큼만 간다(실제 시간이 흘러도 움직이지 않는다).
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const timers = vi.spyOn(globalThis, 'setTimeout')
      const waiting = (ms: number) =>
        until(() => timers.mock.calls.some(([, delay]) => delay === ms))
      answerFirst()

      // 첫 대기는 3초다.
      await waiting(3_000)
      act(() => vi.advanceTimersByTime(2_999))
      expect(tickets.calls).toBe(1)
      act(() => vi.advanceTimersByTime(1))
      await until(() => tickets.calls === 2)
      // 두 번째 대기는 6초다.
      await waiting(6_000)
      act(() => vi.advanceTimersByTime(5_999))
      expect(tickets.calls).toBe(2)
      act(() => vi.advanceTimersByTime(1))
      await until(() => tickets.calls === 3)
      await client.ready
      expect(urlOf(client).searchParams.get('ticket')).toBe('n-3')
    },
  )

  it('알림을 받지 않는 회원이면(403) 다시 받지 않고 연결하지 않는다', async () => {
    renderApp('/lectures', 'USER')
    const tickets = mockNotificationTickets(() => 403)
    const client = await notificationClient()
    await act(() => client.ready)

    expect(client.active).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
    // api()가 역할이 막 바뀐 경우를 위해 토큰을 다시 받아 한 번 더 보낸 것 말고는 다시 받지 않는다.
    expect(tickets.calls).toBe(2)
  })
})

describe('로그인이 끝났을 때', () => {
  /** refresh token이 거절된다(401 INVALID_REFRESH_TOKEN) */
  function rejectRefresh() {
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        HttpResponse.json(
          { status: 401, code: 'INVALID_REFRESH_TOKEN' },
          { status: 401 },
        ),
      ),
    )
  }

  /** 로그인 안내가 하나 열렸고, 비회원으로 바뀌어 헤더에 알림 아이콘 대신 로그인 버튼이 있다(모달이 열려 헤더는 가려져 있다) */
  async function expectSignedOut() {
    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(
      screen.getByText('로그인이 끊겼어요. 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
    expect(getAccessToken()).toBeNull()
    // 헤더는 비회원 모양이다(알림 아이콘 대신 로그인 버튼).
    expect(
      screen.queryByRole('link', { name: /^알림/, hidden: true }),
    ).toBeNull()
    expect(
      screen.getAllByRole('button', { name: '로그인', hidden: true }).length,
    ).toBeGreaterThan(0)
  }

  it('티켓 요청이 401이고 토큰도 다시 받지 못하면 연결하지 않고 비회원으로 바꿔 로그인 안내를 연다', async () => {
    renderApp('/', 'USER')
    rejectRefresh()
    const tickets = mockNotificationTickets(() => 401)
    const client = await notificationClient()

    await expectSignedOut()
    expect(client.active).toBe(false)
    // 다시 받지 못한 결과로 바로 정리한다(티켓을 다시 받지 않는다).
    expect(tickets.calls).toBe(1)
  })

  it('채팅 연결도 같은 때 같은 길로 가면 안내는 하나만 열고 두 연결을 모두 닫는다', async () => {
    renderApp('/', 'INFLUENCER')
    rejectRefresh()
    server.use(
      http.post(
        '*/api/v1/chats/ws-tickets',
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    mockNotificationTickets(() => 401)
    const notifications = await notificationClient()
    await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
    const chat = FakeStompClient.latest()!

    await expectSignedOut()
    await waitFor(() => {
      expect(notifications.active).toBe(false)
      expect(chat.active).toBe(false)
    })
  })
})
