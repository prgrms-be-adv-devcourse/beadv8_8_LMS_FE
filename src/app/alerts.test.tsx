import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { NotificationItem } from '@/entities/notification/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import {
  headerAlertsLink,
  mockNotifications,
  notification,
  notificationNotFound,
} from '@/test/notificationMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

const READ = '2026-11-16T04:00:00Z'

const list = () => screen.findByRole('region', { name: '알림 목록' })

/** 알림 문구로 찾은 목록 항목(누를 수 있으면 버튼) */
const itemOf = async (message: string) =>
  (await within(await list()).findByText(message)).closest(
    'button, div',
  ) as HTMLElement

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('알림 목록', () => {
  it('서버 문구와 발생 시각(KST)을 최신순 그대로 보이고, 안 읽은 알림은 굵게 표시한다', async () => {
    mockNotifications([
      notification(2, {
        message: '충전이 완료되었습니다.',
        occurredAt: '2026-11-16T11:30:00Z',
      }),
      notification(1, {
        message: '문의에 답변이 도착했습니다.',
        targetType: 'INQUIRY',
        readAt: READ,
      }),
    ])
    renderApp('/alerts', 'USER')
    const panel = await list()
    const buttons = await within(panel).findAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining('충전이 완료되었습니다.'),
      expect.stringContaining('문의에 답변이 도착했습니다.'),
    ])
    // 안 읽은 알림: 굵은 문구, 읽는 이름에 '안 읽음'
    const unread = buttons[0]
    expect(within(unread).getByText('충전이 완료되었습니다.').tagName).toBe('B')
    expect(unread).toHaveAccessibleName(/^안 읽음,/)
    expect(unread).toHaveTextContent('11/16(월) 20:30')
    // 읽은 알림
    const read = buttons[1]
    expect(within(read).getByText('문의에 답변이 도착했습니다.').tagName).toBe(
      'SPAN',
    )
    expect(read).not.toHaveAccessibleName(/안 읽음/)
    expect(screen.getByText('최근 알림 20개까지 보여요.')).toBeInTheDocument()
  })

  it.each([
    [
      '유저',
      'USER',
      '충전, 구매 확정, 문의 답변 소식이 생기면 여기에 모아 둘게요.',
    ],
    [
      '인플루언서',
      'INFLUENCER',
      '출연 요청, 출연 확인, 지급·송금 소식이 생기면 여기에 모아 둘게요.',
    ],
    [
      '인증된 인플루언서',
      'VERIFIED_INFLUENCER',
      '출연 요청, 출연 확인, 지급·송금 소식이 생기면 여기에 모아 둘게요.',
    ],
  ] as const)(
    '%s의 빈 화면은 역할에 맞는 알림 종류를 안내한다',
    async (_, viewer, text) => {
      mockNotifications([])
      renderApp('/alerts', viewer)
      expect(await screen.findByText('새 알림이 없어요')).toBeInTheDocument()
      expect(screen.getByText(text)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '모두 읽음' })).toBeNull()
      expect(screen.queryByText('최근 알림 20개까지 보여요.')).toBeNull()
    },
  )

  it('목록을 불러오지 못하면 오류를 보인다', async () => {
    server.use(
      http.get('*/api/v1/notifications', () =>
        HttpResponse.json(
          { status: 400, code: 'X', detail: '잘못된 요청이에요.' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/alerts', 'USER')
    expect(await screen.findByText('불러오지 못했어요')).toBeInTheDocument()
  })

  it('목록을 연 것만으로는 읽음 요청을 보내지 않는다', async () => {
    const calls = mockNotifications([
      notification(1),
      notification(2, { targetType: null, targetId: null }),
    ])
    renderApp('/alerts', 'USER')
    await waitFor(() =>
      expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 2개'),
    )
    // 연 뒤에 처음 보내는 읽음은 누른 알림 하나뿐이다. 열 때 보낸 읽음이 있었다면 그보다 먼저 도착한다.
    await userEvent.click(await itemOf('알림 2'))
    await waitFor(() => expect(calls.reads).toContain(2))
    expect(calls.reads).toEqual([2])
  })
})

describe('모두 읽음', () => {
  it('누르면 목록과 헤더 배지에서 안 읽음이 사라지고, 버튼은 남아 포커스를 잃지 않은 채 막힌다', async () => {
    const calls = mockNotifications([
      notification(1),
      notification(2),
      notification(3, { readAt: READ }),
    ])
    renderApp('/alerts', 'USER')
    await waitFor(() =>
      expect(headerAlertsLink()).toHaveAccessibleName('알림, 안 읽은 알림 2개'),
    )
    const markAll = await screen.findByRole('button', { name: '모두 읽음' })
    await userEvent.click(markAll)
    await waitFor(() => expect(headerAlertsLink()).toHaveAccessibleName('알림'))
    expect(headerAlertsLink()).toHaveTextContent(/^$/)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '모두 읽음' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(screen.getByRole('button', { name: '모두 읽음' })).toHaveFocus()
    expect(within(await list()).queryByText(/안 읽음/)).toBeNull()
    // 막힌 버튼은 다시 눌러도 보내지 않는다
    await userEvent.click(screen.getByRole('button', { name: '모두 읽음' }))
    expect(calls.readAllCount()).toBe(1)
  })

  it('모두 읽은 목록에서는 버튼을 막아 둔다', async () => {
    const calls = mockNotifications([notification(1, { readAt: READ })])
    renderApp('/alerts', 'USER')
    await itemOf('알림 1')
    const markAll = screen.getByRole('button', { name: '모두 읽음' })
    expect(markAll).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(markAll)
    expect(calls.readAllCount()).toBe(0)
  })
})

describe('알림을 누르면', () => {
  it.each<[string, Partial<NotificationItem>, string]>([
    ['충전', { targetType: 'CHARGE', targetId: '55' }, '/wallet'],
    [
      '강의 구매 완료',
      {
        kind: 'LECTURE_ORDER_PAID',
        targetType: 'LECTURE_ORDER',
        targetId: '31',
      },
      '/library/orders/31/done',
    ],
    [
      '문의 답변',
      { kind: 'INQUIRY_ANSWERED', targetType: 'INQUIRY', targetId: '9' },
      '/support/inquiries/9',
    ],
    [
      '주문 항목(구매자 종류)',
      {
        kind: 'LECTURE_ORDER_ITEM_CONFIRMED',
        targetType: 'LECTURE_ORDER_ITEM',
        targetId: '77',
      },
      '/library/orders',
    ],
    [
      '이의 제기 접수(구매자·판매자 둘 다 받는 종류, 판매자가 될 수 없는 유저)',
      {
        kind: 'LECTURE_OBJECTION_FILED',
        targetType: 'LECTURE_ORDER_ITEM',
        targetId: '77',
      },
      '/library/orders',
    ],
  ])(
    '유저: %s 알림은 읽음을 보내고 그 화면으로 간다',
    async (_, over, path) => {
      const calls = mockNotifications([notification(1, over)])
      const router = renderApp('/alerts', 'USER')
      await userEvent.click(await itemOf('알림 1'))
      expect(router.state.location.pathname).toBe(path)
      await waitFor(() => expect(calls.reads).toEqual([1]))
    },
  )

  it.each<[string, Partial<NotificationItem>, string]>([
    [
      '출연 요청',
      {
        kind: 'APPEARANCE_REQUESTED',
        targetType: 'APPEARANCE_REQUEST',
        targetId: '7',
      },
      '/appearances/requests/7',
    ],
    [
      '모집 지원',
      {
        kind: 'RECRUIT_APPLIED',
        targetType: 'APPEARANCE_RECRUIT',
        targetId: '4',
      },
      '/recruits/4',
    ],
    [
      '단체방 초대',
      { kind: 'CHAT_GROUP_INVITED', targetType: 'CHAT_ROOM', targetId: '3' },
      '/chat/3',
    ],
  ])('인플루언서: %s 알림은 그 화면으로 간다', async (_, over, path) => {
    const calls = mockNotifications([notification(1, over)])
    const router = renderApp('/alerts', 'INFLUENCER')
    await userEvent.click(await itemOf('알림 1'))
    expect(router.state.location.pathname).toBe(path)
    await waitFor(() => expect(calls.reads).toEqual([1]))
  })

  it('판매자 종류의 주문 항목 알림(이의 제기 철회)은 강의 판매로 간다', async () => {
    const calls = mockNotifications([
      notification(1, {
        kind: 'LECTURE_OBJECTION_WITHDRAWN',
        targetType: 'LECTURE_ORDER_ITEM',
        targetId: '77',
      }),
    ])
    const router = renderApp('/alerts', 'VERIFIED_INFLUENCER')
    await userEvent.click(await itemOf('알림 1'))
    expect(router.state.location.pathname).toBe('/studio')
    await waitFor(() => expect(calls.reads).toEqual([1]))
  })

  it('인증된 인플루언서가 받은 이의 제기 접수·판단 알림은 구매자인지 판매자인지 몰라 읽음만 하고 머문다', async () => {
    const calls = mockNotifications([
      notification(1, {
        kind: 'LECTURE_OBJECTION_RESOLVED',
        targetType: 'LECTURE_ORDER_ITEM',
        targetId: '77',
      }),
    ])
    const router = renderApp('/alerts', 'VERIFIED_INFLUENCER')
    await userEvent.click(await itemOf('알림 1'))
    await waitFor(() => expect(calls.reads).toEqual([1]))
    expect(router.state.location.pathname).toBe('/alerts')
  })

  it('읽음이 404여도 기다리지 않고 이동한다', async () => {
    const calls = mockNotifications([notification(1)], {
      readResponse: notificationNotFound,
    })
    const router = renderApp('/alerts', 'USER')
    await userEvent.click(await itemOf('알림 1'))
    expect(router.state.location.pathname).toBe('/wallet')
    await waitFor(() => expect(calls.reads).toEqual([1]))
  })

  it('이미 읽은 알림은 읽음을 다시 보내지 않고 이동한다', async () => {
    const calls = mockNotifications([
      notification(1, { readAt: READ }),
      notification(2, { targetType: null, targetId: null }),
    ])
    const router = renderApp('/alerts', 'USER')
    await userEvent.click(await itemOf('알림 1'))
    expect(router.state.location.pathname).toBe('/wallet')
    // 돌아와 안 읽은 알림을 누른다. 읽은 알림을 누를 때 읽음을 보냈다면 그보다 먼저 도착한다.
    await act(() => router.navigate(-1))
    await userEvent.click(await itemOf('알림 2'))
    await waitFor(() => expect(calls.reads).toContain(2))
    expect(calls.reads).toEqual([2])
  })

  it.each<[string, Partial<NotificationItem>]>([
    [
      '이동 대상이 없는 알림(가입 환영)',
      { kind: 'MEMBER_WELCOME', targetType: null, targetId: null },
    ],
    [
      '모르는 targetType',
      { kind: 'SOMETHING_NEW', targetType: 'SOMETHING_NEW', targetId: '1' },
    ],
    [
      '주문 항목인데 모르는 kind',
      {
        kind: 'SOMETHING_NEW',
        targetType: 'LECTURE_ORDER_ITEM',
        targetId: '1',
      },
    ],
    ['ID가 필요한데 없는 알림', { targetType: 'INQUIRY', targetId: null }],
  ])('%s은 읽음만 하고 머문다', async (_, over) => {
    const calls = mockNotifications([notification(1, over)])
    const router = renderApp('/alerts', 'USER')
    const item = await itemOf('알림 1')
    expect(item).not.toHaveTextContent('›')
    await userEvent.click(item)
    await waitFor(() => expect(calls.reads).toEqual([1]))
    expect(router.state.location.pathname).toBe('/alerts')
    // 읽음이 반영되면 누를 일이 없어 비활성으로 표시한다. 같은 버튼이라 포커스가 그대로 남는다.
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'))
    expect(item).toBeInTheDocument()
    expect(item).toHaveFocus()
    expect(headerAlertsLink()).toHaveAccessibleName('알림')
  })
})

describe('알림 화면 권한', () => {
  it('비회원은 로그인 안내를 본다', async () => {
    renderApp('/alerts', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
  })

  it('관리자는 운영 첫 화면으로 보낸다', async () => {
    const router = renderApp('/alerts', 'ADMIN')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })
})
