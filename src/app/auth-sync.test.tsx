import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { walletQuery } from '@/entities/wallet/api'
import { meQuery } from '@/shared/auth/me'
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '@/shared/auth/token'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { FakeStompClient } from '@/test/fakeStomp'
import { renderApp, rs, TEST_ACCESS_TOKEN } from '@/test/renderApp'
import { server } from '@/test/server'

const AUTH_CHANNEL = 'hapbang.auth'
const channels: BroadcastChannel[] = []

/** 다른 탭을 흉내 내는 채널 */
function otherTab() {
  const channel = new BroadcastChannel(AUTH_CHANNEL)
  channels.push(channel)
  return channel
}

async function connectSocket() {
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  return client
}

afterEach(() => {
  channels.splice(0).forEach((c) => c.close())
  queryClient.clear()
  closeLoginModal()
})

describe('탭 간 로그아웃 동기화', () => {
  it('다른 탭에서 로그아웃하면 이 탭도 비회원이 되고 채팅 연결을 닫는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const client = await connectSocket()
    expect(client.active).toBe(true)

    act(() => otherTab().postMessage({ type: 'logout' }))

    expect(
      await screen.findByText('다른 탭에서 로그아웃했어요.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(client.active).toBe(false))
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
    // 이 탭 메모리의 access token도 버린다.
    expect(getAccessToken()).toBeNull()
  })

  it('이 탭에서 로그아웃하면 refresh token을 폐기하고 토큰·채팅 연결을 버린 뒤 다른 탭에 알리고, 자기 알림은 받지 않는다', async () => {
    let logoutCalls = 0
    server.use(
      http.post('*/api/v1/members/auth/logout', () => {
        logoutCalls++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const received: unknown[] = []
    otherTab().onmessage = (e) => received.push(e.data)
    const router = renderApp('/chat', 'INFLUENCER')
    const client = await connectSocket()

    const shell = await screen.findByRole('banner')
    await userEvent.click(
      within(shell).getByRole('button', { name: '하늘 메뉴' }),
    )
    await userEvent.click(
      within(shell).getByRole('button', { name: '로그아웃' }),
    )

    await waitFor(() => expect(received).toEqual([{ type: 'logout' }]))
    expect(logoutCalls).toBe(1)
    expect(getAccessToken()).toBeNull()
    await waitFor(() => expect(client.active).toBe(false))
    expect(router.state.location.pathname).toBe('/')
    // 자기 알림이 왔다면 다른 탭이 받을 때쯤 같이 도착한다. 잠깐 기다린 뒤 확인한다.
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('다른 탭에서 로그아웃했어요.')).toBeNull()
  })

  it('로그아웃 요청이 실패해도 이 탭의 토큰은 버리고 비회원으로 바꾼다', async () => {
    server.use(
      http.post(
        '*/api/v1/members/auth/logout',
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    renderApp('/lectures', 'USER')
    const shell = await screen.findByRole('banner')
    await userEvent.click(
      within(shell).getByRole('button', { name: '하늘 메뉴' }),
    )
    await userEvent.click(
      within(shell).getByRole('button', { name: '로그아웃' }),
    )

    expect(
      await screen.findByText(
        '로그아웃했지만 서버에 알리지 못했어요. 공용 기기라면 브라우저를 닫아 주세요.',
      ),
    ).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
  })
})

describe('채팅 연결 인증', () => {
  /** 재발급 응답과 횟수. ok가 false면 refresh token이 없어 401(기본 응답) */
  function mockRefresh(ok = true) {
    const state = { calls: 0 }
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        state.calls++
        return ok
          ? rs({ accessToken: `fresh-${state.calls}`, expiresIn: 900 })
          : HttpResponse.json(
              { status: 401, code: 'INVALID_REFRESH_TOKEN' },
              { status: 401 },
            )
      }),
    )
    return state
  }

  /**
   * 연결 티켓 응답. 받은 Authorization과 횟수를 남긴다. respond가 상태 코드를 돌려주면 그 오류로 답한다
   * (부를 때마다 다시 정한다)
   */
  function mockTickets(respond: (call: number) => number | null = () => null) {
    const state = { calls: 0, authorizations: [] as (string | null)[] }
    server.use(
      http.post('*/api/v1/chats/ws-tickets', ({ request }) => {
        state.calls++
        state.authorizations.push(request.headers.get('Authorization'))
        const status = respond(state.calls)
        if (status)
          return HttpResponse.json(
            {
              status,
              code:
                status === 429
                  ? 'TOO_MANY_TICKET_REQUESTS'
                  : status === 503
                    ? 'CONNECTION_TICKET_UNAVAILABLE'
                    : 'FORBIDDEN',
            },
            { status },
          )
        return rs({
          ticket: `t-${state.calls}`,
          expiresIn: 30,
          connectionExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
      }),
    )
    return state
  }

  const urlOf = (client: FakeStompClient) => new URL(client.brokerURL!)

  it('연결할 때 일회용 티켓을 받아 주소에 싣고, CONNECT에는 토큰을 넣지 않는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const tickets = mockTickets()
    const client = await connectSocket()
    await client.ready

    expect(tickets.authorizations).toEqual([`Bearer ${TEST_ACCESS_TOKEN}`])
    expect(urlOf(client).pathname).toBe('/api/v1/chats/ws')
    expect(urlOf(client).searchParams.get('ticket')).toBe('t-1')
    expect(client.connectHeaders).toEqual({})
  })

  it('다시 연결할 때마다 새 티켓을 받는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const tickets = mockTickets()
    const client = await connectSocket()
    await client.ready

    await act(() => client.config.beforeConnect!(client))
    expect(tickets.calls).toBe(2)
    expect(urlOf(client).searchParams.get('ticket')).toBe('t-2')
  })

  it('토큰이 곧 만료되면(60초 안) 먼저 다시 받아 새 토큰으로 티켓을 받는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const refresh = mockRefresh()
    const tickets = mockTickets()
    const client = await connectSocket()
    await client.ready

    setAccessToken('almost-expired', 50)
    await act(() => client.config.beforeConnect!(client))
    expect(refresh.calls).toBe(1)
    expect(tickets.authorizations.at(-1)).toBe('Bearer fresh-1')
  })

  it.each([429, 503])(
    '티켓을 받지 못하면(%d) 재연결과 같은 간격으로 기다렸다 다시 받는다',
    async (status) => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.spyOn(Math, 'random').mockReturnValue(0)
      renderApp('/chat', 'INFLUENCER')
      const tickets = mockTickets((call) => (call <= 2 ? status : null))
      const client = await connectSocket()

      await vi.waitFor(() => expect(tickets.calls).toBe(1))
      // 첫 대기는 3초다.
      await act(() => vi.advanceTimersByTimeAsync(2_900))
      expect(tickets.calls).toBe(1)
      await act(() => vi.advanceTimersByTimeAsync(200))
      await vi.waitFor(() => expect(tickets.calls).toBe(2))
      // 두 번째 대기는 6초다.
      await act(() => vi.advanceTimersByTimeAsync(6_000))
      await act(() => client.ready)
      expect(tickets.calls).toBe(3)
      expect(urlOf(client).searchParams.get('ticket')).toBe('t-3')
      vi.useRealTimers()
    },
  )

  it('채팅을 쓸 수 없는 회원이면(403) 티켓을 다시 받지 않고 연결하지 않는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const tickets = mockTickets(() => 403)
    const client = await connectSocket()
    await client.ready

    expect(client.active).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
    // api()가 역할이 막 바뀐 경우를 위해 토큰을 다시 받아 한 번 더 보낸 것 말고는 다시 받지 않는다.
    expect(tickets.calls).toBe(2)
  })

  it('토큰을 다시 받지 못하면 연결하지 않고 비회원으로 바꾼다', async () => {
    renderApp('/', 'INFLUENCER')
    const refresh = mockRefresh(false)
    const client = await connectSocket()
    await client.ready

    const tickets = mockTickets()
    clearAccessToken()
    await act(() => client.config.beforeConnect!(client))

    expect(
      await screen.findByText('로그인이 끊겼어요. 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
    // 티켓은 받지 않는다.
    expect(tickets.calls).toBe(0)
    expect(client.active).toBe(false)
    // 다시 받지 못한 결과(401)로 바로 정리한다(한 번 더 부르지 않는다).
    expect(refresh.calls).toBe(1)
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
  })

  it('BE가 응답하지 않아 토큰을 다시 받지 못하면 비회원으로 바꾸지 않고 연결을 계속 시도한다', async () => {
    renderApp('/chat', 'INFLUENCER')
    server.use(
      http.post(
        '*/api/v1/members/auth/refresh',
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    const client = await connectSocket()
    await client.ready

    const tickets = mockTickets()
    setAccessToken('almost-expired', 10)
    await act(() => client.config.beforeConnect!(client))

    // 지금 토큰으로 티켓을 받아 연결한다(거절되면 끊긴 뒤 다시 확인한다).
    expect(client.active).toBe(true)
    expect(tickets.authorizations).toEqual(['Bearer almost-expired'])
    expect(urlOf(client).searchParams.get('ticket')).toBe('t-1')
    expect(queryClient.getQueryData(meQuery.queryKey)).not.toBeNull()
  })

  it('연결 만료 60초 전에 새 티켓으로 같은 연결에서 재인증하고, 성공하면 다음 재인증을 잡는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderApp('/chat', 'INFLUENCER')
    const tickets = mockTickets()
    const client = await connectSocket()
    await act(() => client.ready)
    const reauths = () =>
      client.published.filter((p) => p.destination === '/pub/chats/reauth')

    await act(() => vi.advanceTimersByTimeAsync(14 * 60_000 - 1_000))
    expect(reauths()).toEqual([])
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    await vi.waitFor(() => expect(reauths()).toHaveLength(1))
    expect(reauths()[0]).toEqual({
      destination: '/pub/chats/reauth',
      body: '',
      headers: { ticket: 't-2' },
    })
    expect(tickets.calls).toBe(2)

    act(() =>
      client.push('/user/queue/chats/connection', {
        type: 'REAUTHENTICATED',
        code: null,
        connectionExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      }),
    )
    await act(() => vi.advanceTimersByTimeAsync(14 * 60_000))
    await vi.waitFor(() => expect(reauths()).toHaveLength(2))
    // 연결을 끊지 않는다.
    expect(client.active).toBe(true)
    vi.useRealTimers()
  })

  it('로그아웃하면 재인증 타이머를 멈추고 연결을 끊는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderApp('/chat', 'INFLUENCER')
    const tickets = mockTickets()
    const client = await connectSocket()
    await act(() => client.ready)

    act(() => otherTab().postMessage({ type: 'logout' }))
    await vi.waitFor(() => expect(client.active).toBe(false))
    await act(() => vi.advanceTimersByTimeAsync(20 * 60_000))
    expect(
      client.published.filter((p) => p.destination === '/pub/chats/reauth'),
    ).toEqual([])
    expect(tickets.calls).toBe(1)
    vi.useRealTimers()
  })

  it('채팅 불가로 닫히면(1008 CHAT_NOT_ALLOWED) 다시 연결하지 않고 토큰도 다시 받지 않는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const refresh = mockRefresh()
    const client = await connectSocket()

    act(() => client.disconnect({ code: 1008, reason: 'CHAT_NOT_ALLOWED' }))

    expect(client.active).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
    expect(refresh.calls).toBe(0)
  })
})

describe('채팅 연결이 끊겼을 때 로그인 확인', () => {
  it('토큰을 다시 받지 못하면 비회원으로 바꾸고 재연결하지 않는다', async () => {
    let refreshCalls = 0
    // 비회원도 볼 수 있는 화면에서 확인한다(채팅 화면은 권한 안내가 로그인 모달을 다시 연다).
    renderApp('/', 'INFLUENCER')
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        refreshCalls++
        return HttpResponse.json(
          { status: 401, code: 'INVALID_REFRESH_TOKEN' },
          { status: 401 },
        )
      }),
    )
    const client = await connectSocket()
    await waitFor(() =>
      expect(queryClient.getQueryData(walletQuery.queryKey)).toBeDefined(),
    )

    // 토큰 만료로 서버가 닫았다.
    act(() => client.disconnect({ code: 4401, reason: 'TOKEN_EXPIRED' }))

    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('로그인이 끊겼어요. 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(client.active).toBe(false))
    expect(refreshCalls).toBe(1)
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
    expect(getAccessToken()).toBeNull()
    // 이전 회원 데이터(지갑 등)는 남지 않는다.
    expect(queryClient.getQueryData(walletQuery.queryKey)).toBeUndefined()
  })

  it('토큰을 다시 받으면 연결을 유지하고, 다시 연결되기 전에는 한 번만 확인한다', async () => {
    let refreshCalls = 0
    renderApp('/chat', 'INFLUENCER')
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        refreshCalls++
        return rs({ accessToken: `fresh-${refreshCalls}`, expiresIn: 900 })
      }),
    )
    const client = await connectSocket()

    // 다른 기기 로그아웃으로 닫혀도 이 기기의 refresh token이 살아 있으면 다시 연결한다.
    act(() => client.disconnect({ code: 1008, reason: 'LOGGED_OUT' }))
    await waitFor(() => expect(refreshCalls).toBe(1))
    expect(getAccessToken()).toBe('fresh-1')
    // 재연결 시도가 계속 실패해도(BE 중단 등) 매번 확인하지 않는다.
    act(() => client.disconnect())
    expect(client.active).toBe(true)
    expect(refreshCalls).toBe(1)

    // 다시 연결된 뒤 또 끊기면 다시 확인한다.
    act(() => client.connect())
    act(() => client.disconnect())
    await waitFor(() => expect(refreshCalls).toBe(2))
    expect(client.active).toBe(true)
  })
})
