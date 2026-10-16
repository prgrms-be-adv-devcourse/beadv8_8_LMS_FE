import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { walletQuery } from '@/entities/wallet/api'
import { meQuery } from '@/shared/auth/me'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { useToastStore } from '@/shared/ui/toastStore'
import { FakeStompClient } from '@/test/fakeStomp'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
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

const me = {
  id: ME_ID,
  email: 'a@b.c',
  nickname: '하늘',
  role: 'INFLUENCER',
  status: 'ACTIVE',
  profileImageUrl: null,
}

afterEach(() => {
  channels.splice(0).forEach((c) => c.close())
  queryClient.clear()
  closeLoginModal()
  useToastStore.setState({ message: null })
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
  })

  it('이 탭에서 로그아웃하면 다른 탭에 알리고, 자기 알림은 받지 않는다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.post('*/api/v1/members/logout', () => new HttpResponse(null)),
    )
    const received: unknown[] = []
    otherTab().onmessage = (e) => received.push(e.data)
    const router = renderApp('/chat', 'INFLUENCER')
    await connectSocket()

    const shell = await screen.findByRole('banner')
    await userEvent.click(
      within(shell).getByRole('button', { name: '하늘 메뉴' }),
    )
    await userEvent.click(
      within(shell).getByRole('button', { name: '로그아웃' }),
    )

    await waitFor(() => expect(received).toEqual([{ type: 'logout' }]))
    expect(router.state.location.pathname).toBe('/')
    // 자기 알림이 왔다면 다른 탭이 받을 때쯤 같이 도착한다. 잠깐 기다린 뒤 확인한다.
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('다른 탭에서 로그아웃했어요.')).toBeNull()
  })
})

describe('채팅 연결이 끊겼을 때 세션 확인', () => {
  it('세션이 없으면 비회원으로 바꾸고 재연결하지 않는다', async () => {
    let meCalls = 0
    server.use(
      http.get('*/api/v1/members/me', () => {
        meCalls++
        return new HttpResponse(null, { status: 401 })
      }),
    )
    // 비회원도 볼 수 있는 화면에서 확인한다(채팅 화면은 권한 안내가 로그인 모달을 다시 연다).
    renderApp('/', 'INFLUENCER')
    const client = await connectSocket()
    await waitFor(() =>
      expect(queryClient.getQueryData(walletQuery.queryKey)).toBeDefined(),
    )

    act(() => client.disconnect())

    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('로그인이 끊겼어요. 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(client.active).toBe(false))
    expect(meCalls).toBe(1)
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull()
    // 이전 회원 데이터(지갑 등)는 남지 않는다.
    expect(queryClient.getQueryData(walletQuery.queryKey)).toBeUndefined()
  })

  it('세션이 살아 있으면 연결을 유지하고, 다시 연결되기 전에는 한 번만 확인한다', async () => {
    let meCalls = 0
    server.use(
      http.get('*/api/v1/members/me', () => {
        meCalls++
        return rs(me)
      }),
    )
    renderApp('/chat', 'INFLUENCER')
    const client = await connectSocket()

    act(() => client.disconnect())
    await waitFor(() => expect(meCalls).toBe(1))
    // 재연결 시도가 계속 실패해도(BE 중단 등) 매번 확인하지 않는다.
    act(() => client.disconnect())
    expect(client.active).toBe(true)
    expect(meCalls).toBe(1)

    // 다시 연결된 뒤 또 끊기면 다시 확인한다.
    act(() => client.connect())
    act(() => client.disconnect())
    await waitFor(() => expect(meCalls).toBe(2))
    expect(client.active).toBe(true)
  })
})
