import { screen, within } from '@testing-library/react'
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
      messageId: 102,
      roomSequence: 3,
      senderUserId: 8,
      messageType: 'SYSTEM',
      content: '새벽님이 나갔습니다.',
      sentAt: '2026-10-11T20:00:00',
      deletedAt: null,
    },
  ],
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
    expect(items).toHaveLength(6)
    expect(items[0]).toMatch(/하루님이 채팅방을 만들었어요/)
    expect(items[1]).toMatch(/하루.*토요일 9시 방송 맞죠\?/)
    expect(items[2]).toMatch(/새벽.*삭제됨.*네 들어갈게요/)
    // 같은 시각이면 입장·퇴장 기록이 시스템 안내보다 먼저
    expect(items[3]).toMatch(/새벽님이 나갔어요/)
    expect(items[4]).toMatch(/새벽님이 나갔습니다\./)
    expect(items[5]).toMatch(/채팅방이 종료됐어요/)

    expect(screen.getByText('종료')).toBeInTheDocument()
    expect(screen.getByText(/하루 \(회원 #7\) · 나감/)).toBeInTheDocument()
    expect(screen.getByLabelText('채팅방 번호')).toHaveValue('42')
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
