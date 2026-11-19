import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { CartItem } from '@/entities/cart/types'
import type { ChatRoom } from '@/entities/chat/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { openAccountMenu, stubNarrowScreen } from '@/test/accountMenu'
import { headerChatLink } from '@/test/headerChat'
import {
  headerAlertsLink,
  mockNotifications,
  notification,
} from '@/test/notificationMock'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const item = (id: number): CartItem => ({
  lectureId: id,
  title: `강의 ${id}`,
  priceHp: 1000,
  thumbnailUrl: null,
  purchasable: true,
})

/** 담은 강의 count개. 빼기(DELETE)를 하면 이후 조회에 반영한다. */
function mockCart(count: number) {
  let items = Array.from({ length: count }, (_, i) => item(i + 1))
  server.use(
    http.get('*/api/v1/lectures/cart', () =>
      rs({ items, purchasableTotalHp: items.length * 1000 }),
    ),
    http.delete('*/api/v1/lectures/cart/items/:lectureId', ({ params }) => {
      items = items.filter((i) => i.lectureId !== Number(params.lectureId))
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

/** 안 읽은 수만 다른 1:1 방들 */
function mockChatRooms(...unreadCounts: number[]) {
  const rooms: ChatRoom[] = unreadCounts.map((unreadCount, i) => ({
    chatRoomId: i + 1,
    roomType: 'DIRECT',
    status: 'ACTIVE',
    createdAt: '2026-10-14T10:00:00',
    members: [
      {
        userId: ME_ID,
        nickname: '하늘',
        active: true,
        participationVersion: 1,
      },
    ],
    lastMessage: null,
    unreadCount,
  }))
  server.use(http.get('*/api/v1/chats', () => rs(rooms)))
}

const header = () => screen.findByRole('banner')

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('상단 헤더 장바구니', () => {
  it('상단 바에 회원 장바구니 링크와 개수 배지가 있다', async () => {
    mockCart(3)
    renderApp('/lectures', 'USER')
    const link = await within(await header()).findByRole('link', {
      name: '장바구니 3개',
    })
    expect(link).toHaveAttribute('href', '/cart')
    expect(link).toHaveTextContent('3')
  })

  it('홈 헤더에도 같은 장바구니 링크가 있다', async () => {
    mockCart(3)
    renderApp('/', 'INFLUENCER')
    expect(
      await within(await header()).findByRole('link', { name: '장바구니 3개' }),
    ).toHaveAttribute('href', '/cart')
  })

  it('비어 있으면 배지를 숨긴다', async () => {
    mockCart(0)
    renderApp('/lectures', 'USER')
    const bar = await header()
    // 조회가 끝난 뒤에도 개수 없이 '장바구니'다.
    await waitFor(() =>
      expect(queryClient.getQueryState(['cart'])?.status).toBe('success'),
    )
    const link = within(bar).getByRole('link', { name: '장바구니' })
    expect(link).toHaveTextContent(/^$/)
  })

  it('99개를 넘으면 배지는 99+로, 이름에는 실제 개수를 넣는다', async () => {
    mockCart(100)
    renderApp('/lectures', 'USER')
    const link = await within(await header()).findByRole('link', {
      name: '장바구니 100개',
    })
    expect(link).toHaveTextContent('99+')
  })

  it('장바구니를 불러오지 못하면 아이콘만 보인다', async () => {
    server.use(
      http.get('*/api/v1/lectures/cart', () =>
        HttpResponse.json(
          { status: 400, code: 'X', detail: '오류' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/lectures', 'USER')
    const bar = await header()
    await waitFor(() =>
      expect(queryClient.getQueryState(['cart'])?.status).toBe('error'),
    )
    const link = within(bar).getByRole('link', { name: '장바구니' })
    expect(link).toHaveTextContent(/^$/)
  })

  it('장바구니에서 빼면 헤더 배지가 줄어든다', async () => {
    mockCart(2)
    renderApp('/cart', 'USER')
    const bar = await header()
    await within(bar).findByRole('link', { name: '장바구니 2개' })
    await userEvent.click(
      await screen.findByRole('button', { name: '강의 1 장바구니에서 빼기' }),
    )
    expect(
      await within(bar).findByRole('link', { name: '장바구니 1개' }),
    ).toBeInTheDocument()
  })

  it('장바구니에서 빼는 동안 그 행만 막고, 뺀 뒤에는 다음 행(없으면 둘러보기)으로 포커스를 옮긴다', async () => {
    mockCart(2)
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    // 첫 삭제만 붙잡아 둔 뒤 mockCart의 처리로 넘긴다.
    server.use(
      http.delete(
        '*/api/v1/lectures/cart/items/:lectureId',
        async () => {
          await gate
        },
        { once: true },
      ),
    )
    renderApp('/cart', 'USER')

    const first = await screen.findByRole('button', {
      name: '강의 1 장바구니에서 빼기',
    })
    await userEvent.click(first)
    await waitFor(() => expect(first).toBeDisabled())
    expect(
      screen.getByRole('button', { name: '강의 2 장바구니에서 빼기' }),
    ).toBeEnabled()

    release()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '강의 2 장바구니에서 빼기' }),
      ).toHaveFocus(),
    )
    await userEvent.click(
      screen.getByRole('button', { name: '강의 2 장바구니에서 빼기' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '강의 둘러보기' })).toHaveFocus(),
    )
  })
})

describe('상단 헤더 알림', () => {
  it.each([
    ['유저 상단 바', '/lectures', 'USER'],
    ['인플루언서 상단 바', '/lectures', 'INFLUENCER'],
    ['인증된 인플루언서 홈 헤더', '/', 'VERIFIED_INFLUENCER'],
  ] as const)('%s에 알림 링크가 있다', async (_, path, viewer) => {
    mockCart(0)
    renderApp(path, viewer)
    const bar = await header()
    expect(
      await within(bar).findByRole('link', { name: '알림' }),
    ).toHaveAttribute('href', '/alerts')
  })

  it.each([
    ['비회원', '/lectures', 'GUEST'],
    ['비회원 홈', '/', 'GUEST'],
    ['관리자', '/admin', 'ADMIN'],
    ['관리자 홈', '/', 'ADMIN'],
  ] as const)('%s에게는 알림·장바구니가 없다', async (_, path, viewer) => {
    renderApp(path, viewer)
    const bar = await header()
    await within(bar).findByRole('link', { name: '합방 홈' })
    expect(within(bar).queryByRole('link', { name: /장바구니/ })).toBeNull()
    expect(within(bar).queryByRole('link', { name: /^알림/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /장바구니/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^알림/ })).toBeNull()
  })

  it('안 읽은 알림 수를 배지로 보이고 링크 이름에 넣는다', async () => {
    mockNotifications([
      notification(1),
      notification(2, { readAt: '2026-11-16T04:00:00Z' }),
      notification(3),
    ])
    renderApp('/lectures', 'USER')
    await waitFor(() =>
      expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 2개'),
    )
    const badge = within(headerAlertsLink()).getByText('2')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
  })

  it('안 읽은 알림이 없으면 배지를 숨긴다', async () => {
    mockNotifications([notification(1, { readAt: '2026-11-16T04:00:00Z' })])
    renderApp('/lectures', 'USER')
    await waitFor(() =>
      expect(
        queryClient.getQueryState(['notifications', 'unread-count'])?.status,
      ).toBe('success'),
    )
    expect(headerAlertsLink()).toHaveAccessibleName('알림')
    expect(headerAlertsLink()).toHaveTextContent(/^$/)
  })

  it('안 읽은 수를 불러오지 못하면 아이콘만 보인다', async () => {
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json(
          { status: 400, code: 'X', detail: '오류' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/lectures', 'USER')
    await waitFor(() =>
      expect(
        queryClient.getQueryState(['notifications', 'unread-count'])?.status,
      ).toBe('error'),
    )
    expect(headerAlertsLink()).toHaveAccessibleName('알림')
    expect(headerAlertsLink()).toHaveTextContent(/^$/)
  })

  it('/alerts에서는 알림 아이콘이 켜져 있고 다른 화면에서는 꺼져 있다', async () => {
    renderApp('/alerts', 'USER')
    const bar = await header()
    expect(
      await within(bar).findByRole('link', { name: '알림' }),
    ).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(bar).getByRole('link', { name: '지갑' }))
    expect(within(bar).getByRole('link', { name: '알림' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('좁은 화면에서도 알림은 헤더에 있고 하단 탭바·계정 메뉴에는 없다', async () => {
    stubNarrowScreen()
    renderApp('/lectures', 'USER')
    await within(await header()).findByRole('link', { name: '알림' })
    const tabs = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(within(tabs).queryByRole('link', { name: /^알림/ })).toBeNull()
    const nav = await openAccountMenu()
    expect(within(nav).queryByRole('link', { name: /^알림/ })).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('상단 헤더 채팅', () => {
  it.each([
    ['인플루언서', '/lectures', 'INFLUENCER'],
    ['인증된 인플루언서', '/lectures', 'VERIFIED_INFLUENCER'],
    ['관리자', '/admin', 'ADMIN'],
    ['인플루언서 홈', '/', 'INFLUENCER'],
    ['관리자 홈', '/', 'ADMIN'],
  ] as const)('%s 헤더에 채팅 링크가 있다', async (_, path, viewer) => {
    mockCart(0)
    renderApp(path, viewer)
    const bar = await header()
    expect(
      await within(bar).findByRole('link', { name: '채팅' }),
    ).toHaveAttribute('href', '/chat')
  })

  it.each([
    ['유저', '/lectures', 'USER'],
    ['유저 홈', '/', 'USER'],
  ] as const)('%s 헤더에는 채팅이 없다', async (_, path, viewer) => {
    mockCart(0)
    renderApp(path, viewer)
    const bar = await header()
    await within(bar).findByRole('link', { name: '장바구니' })
    expect(within(bar).queryByRole('link', { name: /채팅/ })).toBeNull()
  })

  it.each([
    ['비회원', '/lectures'],
    ['비회원 홈', '/'],
  ] as const)('%s 헤더에는 채팅이 없다', async (_, path) => {
    renderApp(path, 'GUEST')
    const bar = await header()
    await within(bar).findByRole('button', { name: '로그인' })
    expect(within(bar).queryByRole('link', { name: /채팅/ })).toBeNull()
  })

  it('헤더 순서는 HP · 장바구니 · 채팅 · 알림 · 프로필이다', async () => {
    mockCart(0)
    renderApp('/lectures', 'INFLUENCER')
    const bar = await header()
    await within(bar).findByRole('link', { name: '채팅' })
    const actions = [
      within(bar).getByRole('link', { name: '지갑' }),
      within(bar).getByRole('link', { name: '장바구니' }),
      within(bar).getByRole('link', { name: '채팅' }),
      within(bar).getByRole('link', { name: '알림' }),
      within(bar).getByRole('button', { name: '하늘 메뉴' }),
    ]
    actions.slice(1).forEach((el, i) => {
      expect(
        actions[i].compareDocumentPosition(el) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  it('안 읽은 메시지 수를 배지로 보이고 링크 이름에 넣는다', async () => {
    mockChatRooms(3, 0, 2)
    renderApp('/lectures', 'INFLUENCER')
    await waitFor(() =>
      expect(headerChatLink()).toHaveAccessibleName('채팅, 안 읽은 메시지 5개'),
    )
    const badge = within(headerChatLink()).getByText('5')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
  })

  it('99개를 넘으면 배지는 99+로, 이름에는 실제 개수를 넣는다', async () => {
    mockChatRooms(60, 40)
    renderApp('/admin', 'ADMIN')
    await waitFor(() =>
      expect(headerChatLink()).toHaveAccessibleName(
        '채팅, 안 읽은 메시지 100개',
      ),
    )
    expect(headerChatLink()).toHaveTextContent('99+')
  })

  it('안 읽은 메시지가 없으면 배지를 숨긴다', async () => {
    mockChatRooms(0)
    renderApp('/lectures', 'INFLUENCER')
    await waitFor(() =>
      expect(queryClient.getQueryState(['chat', 'rooms'])?.status).toBe(
        'success',
      ),
    )
    expect(headerChatLink()).toHaveAccessibleName('채팅')
    expect(headerChatLink()).toHaveTextContent(/^$/)
  })

  it.each(['/chat', '/chat/5'])(
    '%s에서는 채팅 아이콘이 켜져 있다',
    async (path) => {
      renderApp(path, 'INFLUENCER')
      const bar = await header()
      expect(
        await within(bar).findByRole('link', { name: /^채팅/ }),
      ).toHaveAttribute('aria-current', 'page')
    },
  )

  it('다른 화면에서는 채팅 아이콘이 꺼져 있다', async () => {
    mockCart(0)
    renderApp('/lectures', 'INFLUENCER')
    const bar = await header()
    expect(
      await within(bar).findByRole('link', { name: '채팅' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('좁은 화면에서도 채팅은 헤더에 있고 하단 탭바·계정 메뉴에는 없다', async () => {
    stubNarrowScreen()
    mockCart(0)
    renderApp('/lectures', 'INFLUENCER')
    await within(await header()).findByRole('link', { name: '채팅' })
    const tabs = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(within(tabs).queryByRole('link', { name: /채팅/ })).toBeNull()
    const nav = await openAccountMenu()
    expect(within(nav).queryByRole('link', { name: /채팅/ })).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('상단 헤더 HP', () => {
  it('HP 칸을 누르면 지갑으로 간다', async () => {
    mockCart(0)
    const router = renderApp('/lectures', 'USER')
    await userEvent.click(
      await within(await header()).findByRole('link', { name: '지갑' }),
    )
    expect(router.state.location.pathname).toBe('/wallet')
    expect(
      await screen.findByRole('heading', { level: 1, name: '지갑' }),
    ).toBeInTheDocument()
  })
})

describe('좁은 화면 헤더', () => {
  it('장바구니는 좁은 화면에서도 헤더에 있다(하단 탭바·계정 메뉴에는 없다)', async () => {
    stubNarrowScreen()
    mockCart(3)
    renderApp('/lectures', 'USER')
    const bar = await header()
    expect(
      await within(bar).findByRole('link', { name: '장바구니 3개' }),
    ).toHaveAttribute('href', '/cart')
    const tabs = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(within(tabs).queryByRole('link', { name: /장바구니/ })).toBeNull()
    const nav = await openAccountMenu()
    expect(within(nav).queryByRole('link', { name: /장바구니/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('아바타 메뉴', () => {
  it('상단 바도 아바타 메뉴로 로그아웃하고, 헤더에 로그아웃 버튼이 드러나 있지 않다', async () => {
    mockCart(0)
    renderApp('/lectures', 'USER')
    const bar = await header()
    const avatar = await within(bar).findByRole('button', { name: '하늘 메뉴' })
    expect(within(bar).queryByRole('button', { name: '로그아웃' })).toBeNull()
    await userEvent.click(avatar)
    expect(
      within(bar).getByRole('button', { name: '로그아웃' }),
    ).toBeInTheDocument()
  })
})
