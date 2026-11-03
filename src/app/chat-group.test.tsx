import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatKeys } from '@/entities/chat/api'
import type { ChatMessage } from '@/entities/chat/types'
import { useChatStore } from '@/features/chat/chatStore'
import { applyChatError } from '@/features/chat/incoming'
import { closeLoginModal } from '@/shared/ui/loginModal'
import {
  GROUP_ROOM_ID,
  groupRoom,
  member,
  mockGroup,
  problem,
} from '@/test/chatGroupMock'
import { deliver } from '@/test/chatServer'
import { FakeStompClient } from '@/test/fakeStomp'
import { ME_ID, renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

const HOST_ID = 3
const GUEST_A = 21
const GUEST_B = 22

let seq = 0
const message = (patch: Partial<ChatMessage> = {}): ChatMessage => {
  seq++
  return {
    messageId: 500 + seq,
    chatRoomId: GROUP_ROOM_ID,
    roomSequence: seq,
    senderUserId: GUEST_A,
    messageType: 'TEXT',
    content: `메시지 ${seq}`,
    sentAt: '2026-11-03T09:00:00',
    ...patch,
  }
}

const toasts = () =>
  screen
    .queryAllByRole('status')
    .filter((el) => el.classList.contains('toast'))
    .map((el) => el.textContent)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

afterEach(() => {
  cleanup()
  queryClient.clear()
  closeLoginModal()
  seq = 0
  useChatStore.setState({ pending: {} })
})

const thread = () => screen.findByRole('region', { name: /단체방$/ })

describe('단체방 화면', () => {
  it('방 목록에 단체방을 제목·인원·상태로 보이고, 읽기 전용 방은 배지를 단다', async () => {
    mockGroup({
      room: groupRoom(
        { status: 'READ_ONLY' },
        { memberCount: 4, statusReason: 'CLOSED_BY_HOST' },
      ),
    })
    renderApp('/chat', 'INFLUENCER')
    const list = await screen.findByRole('navigation', { name: '대화 목록' })
    const link = await within(list).findByRole('link', {
      name: /주말 게임 합방 게스트 모집/,
    })
    expect(link).toHaveTextContent('단체 4명')
    expect(link).toHaveTextContent('읽기 전용')
  })

  it('다른 사람 메시지에 보낸 사람 이름과 호스트 왕관을 보이고, 안내는 회원 이름으로 만든다', async () => {
    mockGroup({
      room: groupRoom({}, { hostUserId: HOST_ID }),
      members: [
        member(HOST_ID, '호스트 별'),
        member(ME_ID, '하늘'),
        member(GUEST_A, '바다'),
      ],
      messages: [
        message({
          messageType: 'SYSTEM',
          content: '',
          senderUserId: HOST_ID,
          notificationKind: 'GROUP_MEMBERS_INVITED',
          groupMembersInvited: {
            v: 1,
            inviterUserId: HOST_ID,
            invitedUserIds: [ME_ID, GUEST_A],
          },
        }),
        message({ senderUserId: HOST_ID, content: '어서 오세요' }),
        message({ senderUserId: GUEST_A, content: '안녕하세요' }),
        // 나간 회원은 참여자 목록에 없어 ID로 보인다.
        message({
          messageType: 'SYSTEM',
          content: '',
          senderUserId: 40,
          notificationKind: 'GROUP_MEMBER_LEFT',
          groupMemberLeft: { v: 1, leftUserId: 40 },
        }),
      ],
    })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    expect(
      await within(region).findByText(
        '호스트 별님이 하늘님, 바다님을 초대했습니다.',
      ),
    ).toBeInTheDocument()
    expect(
      within(region).getByText('회원 40님이 나갔습니다.'),
    ).toBeInTheDocument()
    const hostMessage = within(region).getByText('어서 오세요').parentElement!
    expect(hostMessage).toHaveTextContent('호스트 별')
    expect(
      within(hostMessage).getByRole('img', { name: '호스트' }),
    ).toBeInTheDocument()
    const guestMessage = within(region).getByText('안녕하세요').parentElement!
    expect(guestMessage).toHaveTextContent('바다')
    expect(
      within(guestMessage).queryByRole('img', { name: '호스트' }),
    ).toBeNull()
    // 참여자는 초대·폐쇄를 보지 않고 나가기를 본다.
    expect(within(region).queryByRole('button', { name: '초대' })).toBeNull()
    expect(within(region).queryByRole('button', { name: '폐쇄' })).toBeNull()
    expect(
      within(region).getByRole('button', { name: '나가기' }),
    ).toBeInTheDocument()
  })

  it('사용 중인 방의 호스트는 나가기 대신 초대·폐쇄를 본다', async () => {
    mockGroup()
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    expect(
      await within(region).findByRole('button', { name: '초대' }),
    ).toBeInTheDocument()
    expect(
      within(region).getByRole('button', { name: '폐쇄' }),
    ).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: '나가기' })).toBeNull()
    expect(
      within(region).getByRole('textbox', { name: '메시지' }),
    ).toBeInTheDocument()
  })

  it('일시 중지된 방은 입력을 막고 안내한다', async () => {
    mockGroup({
      room: groupRoom({ status: 'SUSPENDED' }, { hostUserId: HOST_ID }),
    })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    expect(
      await within(region).findByText(/방 사용이 잠시 중지됐어요/),
    ).toBeInTheDocument()
    expect(within(region).queryByRole('textbox', { name: '메시지' })).toBeNull()
  })

  it('읽기 전용 방의 참여자는 보낼 수 없고, 나가면 내 참여 세대를 보낸다', async () => {
    const state = mockGroup({
      room: groupRoom(
        { status: 'READ_ONLY' },
        {
          hostUserId: HOST_ID,
          statusReason: 'CLOSED_BY_HOST',
          historyExpiresAt: '2999-12-31T00:00:00',
          myParticipationVersion: 3,
        },
      ),
    })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    expect(
      await within(region).findByText(/호스트가 폐쇄한 방이에요/),
    ).toHaveTextContent(/일 뒤에는 대화를 볼 수 없어요/)
    expect(within(region).queryByRole('textbox', { name: '메시지' })).toBeNull()

    await userEvent.click(
      within(region).getByRole('button', { name: '나가기' }),
    )
    expect(
      within(region).getByText(/호스트가 다시 초대해야만 들어올 수 있어요/),
    ).toBeInTheDocument()
    const confirms = within(region).getAllByRole('button', { name: '나가기' })
    await userEvent.click(confirms.at(-1)!)
    await waitFor(() => expect(state.leaves).toEqual(['3']))
  })

  it('호스트는 사용 중인 방을 폐쇄하면 읽기 전용이 되고, 그 뒤에는 나갈 수 있다', async () => {
    const state = mockGroup()
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    await userEvent.click(
      await within(region).findByRole('button', { name: '폐쇄' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '단체방을 폐쇄할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '폐쇄' }))

    await waitFor(() => expect(state.closes).toBe(1))
    expect(
      await within(region).findByText(/폐쇄한 방이에요/),
    ).toBeInTheDocument()
    expect(within(region).queryByRole('textbox', { name: '메시지' })).toBeNull()
    expect(within(region).queryByRole('button', { name: '초대' })).toBeNull()
    expect(
      within(region).getByRole('button', { name: '나가기' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('단체방 초대', () => {
  const candidates = () => [
    { userId: GUEST_A, nickname: '바다', invitable: true, reason: null },
    { userId: GUEST_B, nickname: '바다', invitable: true, reason: null },
    {
      userId: 23,
      nickname: '구름',
      invitable: false,
      reason: 'CHAT_NOT_ALLOWED' as const,
    },
  ]

  async function openInvite() {
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    await userEvent.click(
      await within(region).findByRole('button', { name: '초대' }),
    )
    return screen.findByRole('dialog', { name: '단체방에 초대' })
  }

  it('같은 닉네임은 회원 ID로 구분해 여러 명을 고르고, 회원별 결과를 보인다', async () => {
    const state = mockGroup({
      candidates: candidates(),
      inviteResult: (userId) =>
        userId === GUEST_B
          ? { userId, result: 'FAILED', reason: 'ROOM_FULL' }
          : { userId, result: 'JOINED', reason: null },
    })
    const dialog = await openInvite()
    const list = await within(dialog).findByRole('list', { name: '초대 후보' })
    expect(within(list).getByText(`ID ${GUEST_A}`)).toBeInTheDocument()
    expect(within(list).getByText(`ID ${GUEST_B}`)).toBeInTheDocument()
    // 초대할 수 없는 회원은 사유와 함께 고를 수 없다.
    expect(
      within(list).getByText(/지금 채팅할 수 없는 회원이에요/),
    ).toBeInTheDocument()
    const boxes = within(list).getAllByRole('checkbox')
    expect(boxes[2]).toBeDisabled()

    await userEvent.click(boxes[0])
    await userEvent.click(boxes[1])
    await userEvent.click(
      within(dialog).getByRole('button', { name: '2명 초대' }),
    )

    const outcome = await within(dialog).findByRole('status', {
      name: '초대 결과',
    })
    expect(outcome).toHaveTextContent(`바다(ID ${GUEST_A})`)
    expect(outcome).toHaveTextContent(`바다(ID ${GUEST_B}): 정원이 찼어요`)
    expect(state.invites).toHaveLength(1)
    expect(state.invites[0].userIds).toEqual([GUEST_A, GUEST_B])
    expect(state.invites[0].requestId).toMatch(UUID)
    // 참여한 회원은 후보에서 빠지고, 실패한 회원은 다시 나와 다시 고를 수 있다.
    await waitFor(() =>
      expect(within(dialog).queryByText(`ID ${GUEST_A}`)).toBeNull(),
    )
    expect(within(dialog).getByText(`ID ${GUEST_B}`)).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '0명 초대' }),
    ).toBeDisabled()
  })

  it('회원 ID나 닉네임으로 검색한다', async () => {
    const state = mockGroup({ candidates: candidates() })
    const dialog = await openInvite()
    await within(dialog).findByRole('list', { name: '초대 후보' })
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: '초대할 회원 검색' }),
      String(GUEST_B),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: '검색' }))
    await waitFor(() =>
      expect(within(dialog).queryByText(`ID ${GUEST_A}`)).toBeNull(),
    )
    expect(within(dialog).getByText(`ID ${GUEST_B}`)).toBeInTheDocument()
    expect(state.candidateQueries).toEqual([null, String(GUEST_B)])
  })

  it('응답을 받지 못해 다시 보내면 같은 요청 ID를 쓰고, 고른 회원이 바뀌면 새 요청 ID를 쓴다', async () => {
    const state = mockGroup({ candidates: candidates() })
    let fail = true
    server.use(
      http.post(
        `*/api/v1/chats/${GROUP_ROOM_ID}/members`,
        async ({ request }) => {
          if (!fail) return undefined
          state.invites.push((await request.json()) as GroupInvite)
          return problem(
            503,
            'APPEARANCE_UNAVAILABLE',
            '지금은 모집글 정보를 확인할 수 없습니다.',
          )
        },
      ),
    )
    const dialog = await openInvite()
    const list = await within(dialog).findByRole('list', { name: '초대 후보' })
    await userEvent.click(within(list).getAllByRole('checkbox')[0])
    await userEvent.click(
      within(dialog).getByRole('button', { name: '1명 초대' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '지금은 모집글 정보를 확인할 수 없습니다.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: '1명 초대' }),
    )
    await waitFor(() => expect(state.invites).toHaveLength(2))
    expect(state.invites[1].requestId).toBe(state.invites[0].requestId)

    // 고른 회원을 바꾸면 새 초대다.
    await userEvent.click(within(list).getAllByRole('checkbox')[1])
    fail = false
    await userEvent.click(
      within(dialog).getByRole('button', { name: '2명 초대' }),
    )
    await waitFor(() => expect(state.invites).toHaveLength(3))
    expect(state.invites[2].requestId).not.toBe(state.invites[0].requestId)
    expect(state.invites[2].userIds).toEqual([GUEST_A, GUEST_B])
  })
})

type GroupInvite = { requestId: string; userIds: number[] }

/** 앱이 맺은 STOMP 연결을 연결된 상태로 만든다 */
async function connectSocket() {
  await waitFor(() => expect(FakeStompClient.latest()).toBeDefined())
  const client = FakeStompClient.latest()!
  act(() => client.connect())
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  return client
}

describe('단체방 상태 변화 반영', () => {
  const candidates = () => [
    { userId: GUEST_A, nickname: '바다', invitable: true, reason: null },
    { userId: GUEST_B, nickname: '파도', invitable: true, reason: null },
  ]

  async function openInvite() {
    const region = await thread()
    await userEvent.click(
      await within(region).findByRole('button', { name: '초대' }),
    )
    return screen.findByRole('dialog', { name: '단체방에 초대' })
  }

  it('참여자가 나갔다는 안내가 오면 초대 후보를 다시 받는다(나간 회원은 다시 후보가 된다)', async () => {
    const state = mockGroup({ candidates: candidates() })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const dialog = await openInvite()
    await within(dialog).findByRole('list', { name: '초대 후보' })
    const client = await connectSocket()
    const before = state.candidateQueries.length
    act(() =>
      deliver(
        client,
        message({
          messageType: 'SYSTEM',
          content: '',
          senderUserId: 40,
          notificationKind: 'GROUP_MEMBER_LEFT',
          groupMemberLeft: { v: 1, leftUserId: 40 },
        }),
        { 'participation-version': '1' },
      ),
    )
    await waitFor(() =>
      expect(state.candidateQueries.length).toBeGreaterThan(before),
    )
  })

  it('초대를 기다리는 사이 새로 고른 회원은 결과가 와도 고른 채로 남는다', async () => {
    const state = mockGroup({ candidates: candidates() })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post(`*/api/v1/chats/${GROUP_ROOM_ID}/members`, async () => {
        await gate
        return undefined
      }),
    )
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const dialog = await openInvite()
    const list = await within(dialog).findByRole('list', { name: '초대 후보' })
    await userEvent.click(within(list).getAllByRole('checkbox')[0])
    await userEvent.click(
      within(dialog).getByRole('button', { name: '1명 초대' }),
    )
    await userEvent.click(within(list).getAllByRole('checkbox')[1])
    act(() => release())
    await within(dialog).findByRole('status', { name: '초대 결과' })
    await waitFor(() => expect(state.invites).toHaveLength(1))
    expect(state.invites[0].userIds).toEqual([GUEST_A])
    expect(
      within(dialog).getByRole('button', { name: '파도(ID 22) 빼기' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '1명 초대' }),
    ).toBeEnabled()
  })

  it('안내 없이 방 인원만 바뀌어도(재동기화·읽기 전용 방의 나가기) 참여자를 다시 받는다', async () => {
    const state = mockGroup({
      members: [member(ME_ID, '하늘'), member(GUEST_A, '바다')],
    })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    await userEvent.click(
      await within(region).findByRole('button', { name: '참여자 2명' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '참여자 2명' })
    await within(dialog).findByText('바다')
    state.members = [member(ME_ID, '하늘')]
    state.room = groupRoom({}, { memberCount: 1 })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: chatKeys.rooms() }),
    )
    await waitFor(() => expect(within(dialog).queryByText('바다')).toBeNull())
  })

  it('초대 창을 연 채로 방이 읽기 전용이 되면 창을 닫는다', async () => {
    const state = mockGroup({ candidates: candidates() })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    await openInvite()
    state.room = groupRoom(
      { status: 'READ_ONLY' },
      { statusReason: 'CLOSED_BY_HOST' },
    )
    await act(() =>
      queryClient.invalidateQueries({ queryKey: chatKeys.rooms() }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '단체방에 초대' }),
      ).toBeNull(),
    )
  })
})

describe('참여자·내보내기', () => {
  it('참여자 목록에서 호스트에 왕관을 보이고, 게스트를 내보내면 참여 세대를 보낸다', async () => {
    const state = mockGroup({
      members: [member(ME_ID, '하늘'), member(GUEST_A, '바다', 4)],
    })
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    await userEvent.click(
      await within(region).findByRole('button', { name: '참여자 2명' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '참여자 2명' })
    const list = await within(dialog).findByRole('list', { name: '참여자' })
    const hostRow = within(list).getByText('하늘').closest('li')!
    expect(
      within(hostRow).getByRole('img', { name: '호스트' }),
    ).toBeInTheDocument()
    // 호스트(나)는 내보낼 수 없다.
    expect(within(hostRow).queryByRole('button')).toBeNull()

    await userEvent.click(
      within(list).getByRole('button', { name: '바다 님 내보내기' }),
    )
    await userEvent.click(
      within(list).getByRole('button', { name: '바다 님 내보내기 확인' }),
    )
    await waitFor(() =>
      expect(state.kicks).toEqual([
        { userId: GUEST_A, participationVersion: 4 },
      ]),
    )
    await waitFor(() => expect(within(list).queryByText('바다')).toBeNull())
    expect(toasts()).toContain('바다 님을 내보냈어요.')
  })

  it('대상이 다시 초대돼 세대가 바뀌었으면 다시 확인하라고 알린다', async () => {
    mockGroup({ members: [member(ME_ID, '하늘'), member(GUEST_A, '바다', 4)] })
    server.use(
      http.delete(`*/api/v1/chats/${GROUP_ROOM_ID}/members/${GUEST_A}`, () =>
        problem(409, 'STALE_PARTICIPATION', '참여 상태가 바뀌었습니다.'),
      ),
    )
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    await userEvent.click(
      await within(region).findByRole('button', { name: '참여자 2명' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '참여자 2명' })
    await userEvent.click(
      await within(dialog).findByRole('button', { name: '바다 님 내보내기' }),
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: '바다 님 내보내기 확인' }),
    )
    await waitFor(() =>
      expect(toasts()).toContain(
        '참여 상태가 바뀌었어요. 참여자 목록을 새로 불러왔으니 다시 확인해 주세요.',
      ),
    )
  })
})

describe('보내기 오류', () => {
  it('서버가 사용 중이 아닌 방이라고 거절하면 방 상태를 다시 불러와 입력을 막는다', async () => {
    const state = mockGroup()
    renderApp(`/chat/${GROUP_ROOM_ID}`, 'INFLUENCER')
    const region = await thread()
    await within(region).findByRole('textbox', { name: '메시지' })
    state.room = groupRoom(
      { status: 'READ_ONLY' },
      { statusReason: 'HOST_UNAVAILABLE' },
    )
    applyChatError(queryClient, {
      code: 'GROUP_ROOM_NOT_ACTIVE',
      message: '사용 중인 단체방에서만 할 수 있습니다.',
    })
    expect(
      await within(region).findByText(/호스트가 방을 운영할 수 없게 되어/),
    ).toBeInTheDocument()
    expect(within(region).queryByRole('textbox', { name: '메시지' })).toBeNull()
  })
})

it('단체방 정보가 없는 방(전환 전 서버)은 1:1 방처럼 그린다', async () => {
  server.use(
    http.get('*/api/v1/chats', () =>
      HttpResponse.json({
        statusCode: 200,
        message: '',
        data: [{ ...groupRoom(), roomType: 'DIRECT', group: undefined }],
      }),
    ),
  )
  renderApp('/chat', 'INFLUENCER')
  const list = await screen.findByRole('navigation', { name: '대화 목록' })
  expect(await within(list).findByRole('link')).toHaveTextContent(
    '알 수 없는 회원',
  )
})
