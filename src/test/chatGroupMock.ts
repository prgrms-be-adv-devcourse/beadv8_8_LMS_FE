import { http, HttpResponse } from 'msw'
import type {
  ChatGroupSummary,
  ChatInviteCandidate,
  ChatInviteOutcome,
  ChatMessage,
  ChatRoom,
  ChatRoomMember,
} from '@/entities/chat/types'
import { ME_ID, rs } from './renderApp'
import { server } from './server'

/** 모집용 단체방 BE 흉내(BE #584 계약). 테스트는 state를 바꿔 다음 응답을 정한다 */

export const GROUP_ROOM_ID = 9
export const RECRUIT_ID = 7

export const groupSummary = (
  patch: Partial<ChatGroupSummary> = {},
): ChatGroupSummary => ({
  recruitId: RECRUIT_ID,
  hostUserId: ME_ID,
  title: '주말 게임 합방 게스트 모집',
  statusReason: null,
  readOnlyAt: null,
  historyExpiresAt: null,
  memberCount: 2,
  maxGuestMembers: 500,
  myParticipationVersion: 1,
  ...patch,
})

export const groupRoom = (
  patch: Partial<ChatRoom> = {},
  group: Partial<ChatGroupSummary> = {},
): ChatRoom => ({
  chatRoomId: GROUP_ROOM_ID,
  roomType: 'GROUP',
  status: 'ACTIVE',
  createdAt: '2026-11-02T10:00:00',
  members: [],
  lastMessage: null,
  unreadCount: 0,
  group: groupSummary(group),
  ...patch,
})

export const member = (
  userId: number,
  nickname: string,
  participationVersion = 1,
): ChatRoomMember => ({ userId, nickname, active: true, participationVersion })

export type GroupMockState = {
  room: ChatRoom
  members: ChatRoomMember[]
  messages: ChatMessage[]
  candidates: ChatInviteCandidate[]
  remainingGuestSlots: number
  /** 초대 응답(요청한 회원 ID → 결과). 없으면 JOINED */
  inviteResult?: (userId: number) => ChatInviteOutcome
  /** 보낸 요청 기록 */
  invites: { requestId: string; userIds: number[] }[]
  candidateQueries: (string | null)[]
  kicks: { userId: number; participationVersion: number }[]
  closes: number
  leaves: (string | null)[]
}

/**
 * 단체방 하나를 흉내 낸다. 방 목록·방 이력·참여자·초대 후보·초대·내보내기·폐쇄·나가기.
 * 초대에 성공한 회원은 참여자가 되고 후보에서 빠진다. 폐쇄하면 읽기 전용이 된다
 */
export function mockGroup(init: Partial<GroupMockState> = {}) {
  const state: GroupMockState = {
    room: groupRoom(),
    members: [member(ME_ID, '하늘')],
    messages: [],
    candidates: [],
    remainingGuestSlots: 499,
    invites: [],
    candidateQueries: [],
    kicks: [],
    closes: 0,
    leaves: [],
    ...init,
  }
  server.use(
    http.get('*/api/v1/chats', () => rs([state.room])),
    http.put(
      '*/api/v1/chats/:roomId/read',
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`*/api/v1/chats/${GROUP_ROOM_ID}/messages`, () =>
      rs({
        messages: [...state.messages].reverse(),
        nextCursor: null,
        participationVersion: state.room.group?.myParticipationVersion,
      }),
    ),
    http.get(`*/api/v1/chats/${GROUP_ROOM_ID}/members`, () =>
      rs({ members: state.members, nextCursor: null }),
    ),
    http.get(
      `*/api/v1/chats/${GROUP_ROOM_ID}/invite-candidates`,
      ({ request }) => {
        const keyword = new URL(request.url).searchParams.get('keyword')
        state.candidateQueries.push(keyword)
        const shown = state.candidates.filter(
          (c) =>
            !keyword ||
            String(c.userId) === keyword ||
            c.nickname.includes(keyword),
        )
        return rs({
          candidates: shown,
          nextCursor: null,
          remainingGuestSlots: state.remainingGuestSlots,
        })
      },
    ),
    http.post(
      `*/api/v1/chats/${GROUP_ROOM_ID}/members`,
      async ({ request }) => {
        const body = (await request.json()) as {
          requestId: string
          userIds: number[]
        }
        state.invites.push(body)
        const results = body.userIds.map(
          (userId) =>
            state.inviteResult?.(userId) ?? {
              userId,
              result: 'JOINED' as const,
              reason: null,
            },
        )
        for (const r of results) {
          if (r.result !== 'JOINED') continue
          const c = state.candidates.find((x) => x.userId === r.userId)
          state.candidates = state.candidates.filter(
            (x) => x.userId !== r.userId,
          )
          state.members.push(member(r.userId, c?.nickname ?? '회원'))
        }
        return rs({
          chatRoomId: GROUP_ROOM_ID,
          requestId: body.requestId,
          results,
        })
      },
    ),
    http.delete(`*/api/v1/chats/${GROUP_ROOM_ID}/members/me`, ({ request }) => {
      state.leaves.push(
        new URL(request.url).searchParams.get('participationVersion'),
      )
      return new HttpResponse(null, { status: 204 })
    }),
    http.delete(
      `*/api/v1/chats/${GROUP_ROOM_ID}/members/:userId`,
      ({ params, request }) => {
        const userId = Number(params.userId)
        const participationVersion = Number(
          new URL(request.url).searchParams.get('participationVersion'),
        )
        state.kicks.push({ userId, participationVersion })
        state.members = state.members.filter((m) => m.userId !== userId)
        return new HttpResponse(null, { status: 204 })
      },
    ),
    http.post(`*/api/v1/chats/${GROUP_ROOM_ID}/close`, () => {
      state.closes++
      state.room = {
        ...state.room,
        status: 'READ_ONLY',
        group: {
          ...state.room.group!,
          statusReason: 'CLOSED_BY_HOST',
          readOnlyAt: '2026-11-03T10:00:00',
          historyExpiresAt: '2026-12-03T10:00:00',
        },
      }
      return rs({
        chatRoomId: GROUP_ROOM_ID,
        status: 'READ_ONLY',
        statusReason: 'CLOSED_BY_HOST',
        readOnlyAt: '2026-11-03T10:00:00',
        historyExpiresAt: '2026-12-03T10:00:00',
      })
    }),
  )
  return state
}

/** ProblemDetail 오류 응답 */
export const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json(
    { status, code, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
