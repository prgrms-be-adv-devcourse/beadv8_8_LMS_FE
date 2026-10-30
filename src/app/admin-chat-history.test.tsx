import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { ChatRoomHistory } from '@/entities/chat/types'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const history: ChatRoomHistory = {
  chatRoomId: 42,
  status: 'ENDED',
  createdAt: '2026-10-10T10:00:00',
  endedAt: '2026-10-12T09:00:00',
  members: [
    { userId: 7, nickname: '하루', active: false, participationVersion: 1 },
    { userId: 8, nickname: '새벽', active: false, participationVersion: 1 },
  ],
  logs: [
    {
      logId: 1,
      actorUserId: 7,
      eventType: 'ROOM_CREATED',
      occurredAt: '2026-10-10T10:00:00',
    },
    {
      logId: 2,
      actorUserId: 8,
      eventType: 'MEMBER_LEFT',
      occurredAt: '2026-10-11T20:00:00',
    },
    {
      logId: 3,
      actorUserId: null,
      eventType: 'ROOM_ENDED',
      occurredAt: '2026-10-12T09:00:00',
    },
  ],
  messages: [
    {
      messageId: 100,
      roomSequence: 1,
      senderUserId: 7,
      messageType: 'TEXT',
      content: '토요일 9시 방송 맞죠?',
      sentAt: '2026-10-10T10:01:00',
      deletedAt: null,
    },
    {
      messageId: 101,
      roomSequence: 2,
      senderUserId: 8,
      messageType: 'TEXT',
      content: '네 들어갈게요',
      sentAt: '2026-10-10T10:02:00',
      deletedAt: '2026-10-11T19:00:00',
    },
    {
      messageId: 103,
      roomSequence: 4,
      senderUserId: 8,
      messageType: 'NOTIFICATION',
      content: '새벽님이 출연 모집에 지원했습니다.\n모집글: 주말 합방',
      sentAt: '2026-10-10T10:03:00',
      deletedAt: null,
      notificationKind: 'APPEARANCE_APPLICATION_SUBMITTED',
      referenceId: 4,
      parentReferenceId: 7,
    },
    {
      messageId: 102,
      roomSequence: 3,
      senderUserId: 8,
      messageType: 'SYSTEM',
      content: '새벽님이 나갔습니다.',
      sentAt: '2026-10-11T20:00:00',
      deletedAt: null,
    },
  ],
  nextCursor: null,
}

afterEach(() => queryClient.clear())

describe('관리자 채팅 기록', () => {
  it('운영 메뉴에서 채팅방 번호로 찾아 기록 화면으로 간다', async () => {
    server.use(http.get('*/api/v1/chats/admin/42/history', () => rs(history)))
    const router = renderApp('/admin/chats', 'ADMIN')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '채팅 기록' }),
    ).toHaveAttribute('href', '/admin/chats')
    const submit = screen.getByRole('button', { name: '조회' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText('채팅방 번호'), '42')
    await userEvent.click(submit)

    expect(router.state.location.pathname).toBe('/admin/chats/42')
    expect(
      await screen.findByRole('heading', { name: '채팅방 #42' }),
    ).toBeInTheDocument()
  })

  it('메시지와 입장·퇴장 기록을 시간순으로, 삭제된 메시지도 표시한다', async () => {
    server.use(http.get('*/api/v1/chats/admin/42/history', () => rs(history)))
    renderApp('/admin/chats/42', 'ADMIN')

    const list = await screen.findByRole('list', { name: '채팅 기록' })
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toHaveLength(7)
    expect(items[0]).toMatch(/하루님이 채팅방을 만들었어요/)
    expect(items[1]).toMatch(/하루.*토요일 9시 방송 맞죠\?/)
    expect(items[2]).toMatch(/새벽.*삭제됨.*네 들어갈게요/)
    // 같은 시각이면 입장·퇴장 기록이 시스템 안내보다 먼저
    expect(items[3]).toMatch(
      /출연 알림.*모집에 지원했습니다.*모집 지원 #4 · 모집글 #7/s,
    )
    expect(items[4]).toMatch(/새벽님이 나갔어요/)
    expect(items[5]).toMatch(/새벽님이 나갔습니다\./)
    expect(items[6]).toMatch(/채팅방이 종료됐어요/)
    expect(screen.getByRole('link', { name: '모집글 #7' })).toHaveAttribute(
      'href',
      '/recruits/7',
    )

    expect(screen.getByText('종료')).toBeInTheDocument()
    expect(screen.getByText(/하루 \(회원 #7\) · 나감/)).toBeInTheDocument()
    expect(screen.getByLabelText('채팅방 번호')).toHaveValue('42')
  })

  it('값(알림 종류별 필드)으로 남긴 알림은 회원 화면과 같은 템플릿으로 문구를 만든다', async () => {
    server.use(
      http.get('*/api/v1/chats/admin/42/history', () =>
        rs({
          ...history,
          messages: [
            {
              messageId: 201,
              roomSequence: 1,
              senderUserId: 7,
              messageType: 'NOTIFICATION',
              content: '',
              sentAt: '2026-10-10T10:00:00',
              deletedAt: null,
              notificationKind: 'APPEARANCE_REQUEST_SENT',
              referenceId: 30,
              parentReferenceId: null,
              appearanceApplicationSubmitted: null,
              appearanceRequestSent: {
                v: 1,
                hostNickname: '하루',
                title: '금요일 밤 합방',
                fee: 50000,
                scheduledAt: '2026-11-20T21:00:00',
                acceptDeadline: '2026-11-13T23:59:00',
              },
            },
          ],
          logs: [],
        }),
      ),
    )
    renderApp('/admin/chats/42', 'ADMIN')

    const list = await screen.findByRole('list', { name: '채팅 기록' })
    const [item] = within(list).getAllByRole('listitem')
    expect(item.textContent).toMatch(
      /하루님이 출연을 요청했습니다\.\s*제목: 금요일 밤 합방\s*출연료: 50,000 HP\s*방송 예정: 11\/20\(금\) 21:00\s*수락 기한: 11\/13\(금\) 23:59.*출연 요청서 #30/s,
    )
  })

  it('여러 페이지에 나뉜 기록을 이어 받아 빠짐·중복 없이 시간순으로 보여 준다', async () => {
    const at = (minute: number) =>
      `2026-10-10T10:${String(minute).padStart(2, '0')}:00`
    const msg = (id: number, minute: number, content: string) => ({
      messageId: id,
      roomSequence: id,
      senderUserId: 7,
      messageType: 'TEXT' as const,
      content,
      sentAt: at(minute),
      deletedAt: null,
    })
    // 1페이지 끝과 2페이지 처음이 같은 시각: 기록이 메시지보다 먼저다.
    const pages: Record<string, ChatRoomHistory> = {
      first: {
        ...history,
        logs: [
          {
            logId: 1,
            actorUserId: 7,
            eventType: 'ROOM_CREATED',
            occurredAt: at(0),
          },
          {
            logId: 2,
            actorUserId: 8,
            eventType: 'MEMBER_LEFT',
            occurredAt: at(2),
          },
        ],
        messages: [msg(1, 1, '첫 메시지')],
        nextCursor: 'c1',
      },
      c1: {
        // 방 정보는 첫 페이지 값을 쓴다. 다음 페이지 값이 달라도 화면은 바뀌지 않는다.
        ...history,
        status: 'ACTIVE',
        endedAt: null,
        members: [
          {
            userId: 7,
            nickname: '바뀐 닉네임',
            active: true,
            participationVersion: 2,
          },
        ],
        logs: [],
        messages: [
          msg(2, 2, '퇴장 안내 직후'),
          // 같은 밀리초 안에서 마이크로초로만 다르고 ID는 거꾸로다: 시각이 먼저다.
          { ...msg(9, 3, '같은 밀리초 앞'), sentAt: `${at(3)}.000100` },
          { ...msg(3, 3, '같은 밀리초 뒤'), sentAt: `${at(3)}.000200` },
        ],
        nextCursor: null,
      },
    }
    const cursors: (string | null)[] = []
    server.use(
      http.get('*/api/v1/chats/admin/42/history', ({ request }) => {
        const url = new URL(request.url)
        const cursor = url.searchParams.get('cursor')
        cursors.push(cursor)
        return rs(pages[cursor ?? 'first'])
      }),
    )
    renderApp('/admin/chats/42', 'ADMIN')

    const list = await screen.findByRole('list', { name: '채팅 기록' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(/불러온 메시지/)).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: '다음 기록 더 보기' }),
    )
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(6),
    )
    expect(cursors).toEqual([null, 'c1'])
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items[0]).toMatch(/채팅방을 만들었어요/)
    expect(items[1]).toMatch(/첫 메시지/)
    expect(items[2]).toMatch(/새벽님이 나갔어요/)
    expect(items[3]).toMatch(/퇴장 안내 직후/)
    expect(items[4]).toMatch(/같은 밀리초 앞/)
    expect(items[5]).toMatch(/같은 밀리초 뒤/)
    // 마지막 페이지면 더 보기가 없다.
    expect(
      screen.queryByRole('button', { name: '다음 기록 더 보기' }),
    ).toBeNull()
    expect(screen.getByText('4개')).toBeInTheDocument()
    // 방 정보는 첫 페이지 값(종료, 종료 시각, 참여자) 그대로다.
    expect(screen.getByText('종료')).toBeInTheDocument()
    expect(screen.getByText('종료 시각')).toBeInTheDocument()
    expect(screen.getByText(/하루 \(회원 #7\) · 나감/)).toBeInTheDocument()
    expect(screen.queryByText(/바뀐 닉네임/)).toBeNull()
  })

  it('다음 기록을 못 불러와도 불러온 기록은 그대로 두고, 다시 시도하면 이어 붙인다', async () => {
    let failNext = true
    server.use(
      http.get('*/api/v1/chats/admin/42/history', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor) return rs({ ...history, nextCursor: 'c1' })
        if (failNext)
          return HttpResponse.json(
            { status: 500, code: 'INTERNAL_ERROR', detail: '잠시 실패했어요.' },
            { status: 500 },
          )
        return rs({
          ...history,
          logs: [],
          messages: [
            {
              messageId: 500,
              roomSequence: 50,
              senderUserId: 7,
              messageType: 'TEXT',
              content: '다음 페이지 메시지',
              sentAt: '2026-10-12T10:00:00',
              deletedAt: null,
            },
          ],
          nextCursor: null,
        })
      }),
    )
    renderApp('/admin/chats/42', 'ADMIN')
    const list = await screen.findByRole('list', { name: '채팅 기록' })
    const firstCount = within(list).getAllByRole('listitem').length

    await userEvent.click(
      screen.getByRole('button', { name: '다음 기록 더 보기' }),
    )
    // 오류가 나도 불러온 기록과 방 정보는 남는다.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('다음 기록을 불러오지 못했어요.')
    expect(
      within(screen.getByRole('list', { name: '채팅 기록' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(firstCount)
    expect(
      screen.getByRole('heading', { name: '채팅방 #42' }),
    ).toBeInTheDocument()

    failNext = false
    await userEvent.click(
      within(alert).getByRole('button', { name: '다시 시도' }),
    )
    expect(await screen.findByText('다음 페이지 메시지')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      within(screen.getByRole('list', { name: '채팅 기록' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(firstCount + 1)
  })

  it('없는 방이면 안내한다', async () => {
    server.use(
      http.get('*/api/v1/chats/admin/9/history', () =>
        HttpResponse.json(
          { code: 'CHAT_ROOM_NOT_FOUND', detail: '채팅방을 찾을 수 없습니다.' },
          { status: 404 },
        ),
      ),
    )
    renderApp('/admin/chats/9', 'ADMIN')
    expect(
      await screen.findByText('채팅방을 찾을 수 없어요'),
    ).toBeInTheDocument()
  })

  it('관리자가 아니면 열 수 없다', async () => {
    renderApp('/admin/chats/42', 'VERIFIED_INFLUENCER')
    expect(screen.queryByRole('heading', { name: '채팅방 #42' })).toBeNull()
    expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
  })
})
