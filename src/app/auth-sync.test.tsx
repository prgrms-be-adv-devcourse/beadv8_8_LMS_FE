import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('STOMP CONNECT 헤더에 access token을 넣는다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const client = await connectSocket()
    await client.ready
    expect(client.connectHeaders).toEqual({
      Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
    })
  })

  it('다시 연결할 때 토큰이 곧 만료되면 먼저 다시 받아 새 토큰으로 연결한다', async () => {
    renderApp('/chat', 'INFLUENCER')
    const refresh = mockRefresh()
    const client = await connectSocket()
    await client.ready

    setAccessToken('almost-expired', 10)
    await act(() => client.config.beforeConnect!(client))
    expect(refresh.calls).toBe(1)
    expect(client.connectHeaders).toEqual({ Authorization: 'Bearer fresh-1' })
  })

  it('토큰을 다시 받지 못하면 연결하지 않고 비회원으로 바꾼다', async () => {
    renderApp('/', 'INFLUENCER')
    const refresh = mockRefresh(false)
    const client = await connectSocket()
    await client.ready

    clearAccessToken()
    await act(() => client.config.beforeConnect!(client))

    expect(
      await screen.findByText('로그인이 끊겼어요. 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
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

    setAccessToken('almost-expired', 10)
    await act(() => client.config.beforeConnect!(client))

    expect(client.active).toBe(true)
    expect(client.connectHeaders).toEqual({
      Authorization: 'Bearer almost-expired',
    })
    expect(queryClient.getQueryData(meQuery.queryKey)).not.toBeNull()
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
