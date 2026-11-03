import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type {
  ChatConnectionTicket,
  ChatGroupCloseResponse,
  ChatGroupRooms,
  ChatInviteCandidatePage,
  ChatInviteResponse,
  ChatMessagePage,
  ChatRoom,
  ChatRoomHistory,
  ChatRoomMemberPage,
} from './types'

export const chatKeys = {
  all: ['chat'] as const,
  rooms: () => [...chatKeys.all, 'rooms'] as const,
  messages: (chatRoomId: number) =>
    [...chatKeys.all, 'messages', chatRoomId] as const,
  history: (chatRoomId: number) =>
    [...chatKeys.all, 'history', chatRoomId] as const,
  /** 모집글의 단체방(현재 방·이전 방) */
  groups: (recruitId: number) =>
    [...chatKeys.all, 'groups', recruitId] as const,
  /** 방의 참여자 페이지 */
  members: (chatRoomId: number) =>
    [...chatKeys.all, 'members', chatRoomId] as const,
  /** 초대 후보 검색(검색어별) */
  candidates: (chatRoomId: number, keyword?: string) =>
    keyword === undefined
      ? ([...chatKeys.all, 'candidates', chatRoomId] as const)
      : ([...chatKeys.all, 'candidates', chatRoomId, keyword] as const),
}

export const CHAT_PAGE_SIZE = 30

/** 내 채팅방 (참여 중인 방) */
export const chatRoomsQuery = queryOptions({
  queryKey: chatKeys.rooms(),
  queryFn: ({ signal }) => api<ChatRoom[]>('/chats', { signal }),
})

/**
 * 서버가 돌려준 이력 한 페이지를 지켜보는 함수. cursor는 그 페이지를 요청한 커서(최신 페이지면 null).
 * false를 돌려주면(옛 참여 세대의 응답) 그 페이지를 캐시에 넣지 않고 조회를 실패시킨다(다시 시도하면 새 세대로 받는다).
 */
export type ChatPageObserver = (
  chatRoomId: number,
  page: ChatMessagePage,
  cursor: number | null,
  /** 이 조회의 취소 신호. 관찰자는 조회가 끝까지 반영됐는지 판단할 때 쓴다 */
  signal: AbortSignal,
) => boolean

/** 옛 참여 세대의 이력 응답. 캐시에 넣지 않는다 */
export class StaleChatPageError extends Error {
  constructor() {
    super('채팅 참여 상태가 바뀌어 대화를 다시 불러와요.')
    this.name = 'StaleChatPageError'
  }
}

let pageObserver: ChatPageObserver | null = null

/**
 * 이력 응답을 받을 때마다 부를 함수를 정한다(채팅 연결이 수신 확인 구간을 기록한다). 돌려준 함수로 그만 듣는다.
 * 화면이 합치는 실시간 메시지와 섞이기 전의 서버 응답 그대로를 넘긴다.
 */
export function observeChatPages(observer: ChatPageObserver) {
  pageObserver = observer
  return () => {
    if (pageObserver === observer) pageObserver = null
  }
}

/**
 * 메시지 이력. 페이지는 최신순이고 다음 페이지가 더 오래된 메시지다.
 * 내가 볼 수 있는 범위(재입장 이후 등)는 BE가 정한다.
 */
export const chatMessagesQuery = (chatRoomId: number) =>
  infiniteQueryOptions({
    queryKey: chatKeys.messages(chatRoomId),
    queryFn: async ({ pageParam, signal }) => {
      // 요청을 보낸 때의 관찰자(그 회원의 채팅 연결)에만 알린다. 그사이 회원이 바뀌었거나 조회가 취소됐으면
      // 늦게 온 응답을 새 회원의 수신 상태에 기록하지 않는다.
      const observer = pageObserver
      const page = await api<ChatMessagePage>(`/chats/${chatRoomId}/messages`, {
        query: { cursor: pageParam ?? undefined, size: CHAT_PAGE_SIZE },
        signal,
      })
      if (observer && observer === pageObserver && !signal.aborted) {
        if (!observer(chatRoomId, page, pageParam, signal))
          throw new StaleChatPageError()
      }
      return page
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/** 관리자 분쟁 확인용 기록(오래된 쪽부터 페이지). 종료된 방, 숨겨진·삭제된 메시지도 포함한다 */
export const CHAT_HISTORY_PAGE_SIZE = 50

export const chatHistoryQuery = (chatRoomId: number) =>
  infiniteQueryOptions({
    queryKey: chatKeys.history(chatRoomId),
    queryFn: ({ pageParam }) =>
      api<ChatRoomHistory>(`/chats/admin/${chatRoomId}/history`, {
        query: { cursor: pageParam ?? undefined, size: CHAT_HISTORY_PAGE_SIZE },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/**
 * 1:1 채팅 시작. 활성 방이 있으면 그 방을 돌려주고(상대가 나갔으면 바로 재입장), 없으면 새로 만든다.
 */
export function startChat(targetUserId: number) {
  return api<ChatRoom>('/chats', { method: 'POST', body: { targetUserId } })
}

/** 방 나가기. 이미 나갔거나 옛 참여 세대 요청이어도 성공(204) */
export function leaveChatRoom(
  chatRoomId: number,
  participationVersion: number,
) {
  return api<void>(`/chats/${chatRoomId}/members/me`, {
    method: 'DELETE',
    query: { participationVersion },
  })
}

/**
 * 이 순번까지 읽었다고 알린다. 서버는 줄이지 않고 방의 마지막 순번을 넘기지 않는다.
 * participationVersion(이력 응답의 참여 세대)을 함께 보내면 현재 세대와 같을 때만 반영하고, 다르면
 * 409 STALE_PARTICIPATION이다(BE 읽음 위치 계약). 지연 도착한 옛 세대 요청이 새 세대 읽음 위치를 올리지 않게 항상 보낸다.
 */
export function markChatRoomRead(
  chatRoomId: number,
  lastReadSequence: number,
  participationVersion?: number,
) {
  return api<void>(`/chats/${chatRoomId}/read`, {
    method: 'PUT',
    body:
      participationVersion === undefined
        ? { lastReadSequence }
        : { lastReadSequence, participationVersion },
  })
}

/**
 * 채팅 웹소켓 연결 티켓(일회용, 약 30초). 연결(`/chats/ws?ticket=`)과 재인증(`/pub/chats/reauth`)마다 새로 받는다.
 * 인플루언서 이상·관리자만(403). 회원당 60초에 10번까지(429 TOO_MANY_TICKET_REQUESTS), 서버가 티켓을 저장하지
 * 못하면 503 CONNECTION_TICKET_UNAVAILABLE
 */
export function issueConnectionTicket() {
  return api<ChatConnectionTicket>('/chats/ws-tickets', { method: 'POST' })
}

/** 방 목록 정렬: 최근 메시지가 있는 방부터(BE는 방 ID 내림차순). 메시지가 없으면 만든 시각 */
export function sortRoomsByRecent<T extends ChatRoom>(rooms: T[]): T[] {
  const at = (r: ChatRoom) => r.lastMessage?.sentAt ?? r.createdAt
  return [...rooms].sort((a, b) => at(b).localeCompare(at(a)))
}

/**
 * 이력 페이지들을 화면에 그릴 순서(오래된 순, roomSequence 오름차순)로 펼친다. 같은 메시지는 한 번만.
 * 실시간 메시지는 순서가 뒤바뀌어 올 수 있어 페이지 순서에 기대지 않고 순번으로 정렬한다.
 */
export function orderedMessages<
  T extends { messageId: number; roomSequence: number },
>(pages: { messages: T[] }[]): T[] {
  const byId = new Map<number, T>()
  for (const page of pages)
    for (const m of page.messages)
      if (!byId.has(m.messageId)) byId.set(m.messageId, m)
  return [...byId.values()].sort((a, b) => a.roomSequence - b.roomSequence)
}

/** 1:1 방의 상대 (없으면 undefined). 단체방은 늘 undefined */
export function partnerOf(room: ChatRoom, myUserId: number | undefined) {
  if (isGroupRoom(room)) return undefined
  return room.members.find((m) => m.userId !== myUserId)
}

/** 단체방인지(단체방 정보가 있을 때만 단체방으로 다룬다) */
export function isGroupRoom(
  room: ChatRoom,
): room is ChatRoom & { group: NonNullable<ChatRoom['group']> } {
  return room.roomType === 'GROUP' && room.group != null
}

/**
 * 방 목록 항목의 내 참여(참여 중인지, 참여 세대). 1:1 방은 참여자 목록에서, 단체방은 내 참여 세대(group.myParticipationVersion)로
 * 읽는다. 단체방은 참여 중인 방만 목록에 나오므로 세대가 있으면 참여 중이다. 모르면 undefined
 */
export function myMembershipIn(
  room: ChatRoom | undefined,
  myUserId: number | null | undefined,
): { active: boolean; participationVersion: number } | undefined {
  if (!room) return undefined
  if (room.roomType === 'GROUP') {
    const version = room.group?.myParticipationVersion
    return version == null
      ? undefined
      : { active: true, participationVersion: version }
  }
  // 응답에 참여자가 빠져 있을 수 있다(만들기 응답 등).
  return room.members?.find((m) => m.userId === myUserId)
}

/** 모집글의 단체방 중 내가 볼 수 있는 방(현재 방과 읽기 전용으로 남은 이전 방) */
export const chatGroupsQuery = (recruitId: number) =>
  queryOptions({
    queryKey: chatKeys.groups(recruitId),
    queryFn: ({ signal }) =>
      api<ChatGroupRooms>('/chats/groups', { query: { recruitId }, signal }),
  })

/** 모집 단체방 만들기(호스트). 모집글의 현재 방이 있으면 그 방을 돌려준다 */
export function createChatGroup(recruitId: number) {
  return api<ChatRoom>('/chats/groups', {
    method: 'POST',
    body: { recruitId },
  })
}

export const CHAT_MEMBER_PAGE_SIZE = 50

/** 방의 참여자(참여 순, 참여 중인 회원만) */
export const chatMembersQuery = (chatRoomId: number) =>
  infiniteQueryOptions({
    queryKey: chatKeys.members(chatRoomId),
    queryFn: ({ pageParam, signal }) =>
      api<ChatRoomMemberPage>(`/chats/${chatRoomId}/members`, {
        query: { cursor: pageParam ?? undefined, size: CHAT_MEMBER_PAGE_SIZE },
        signal,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

export const CHAT_CANDIDATE_PAGE_SIZE = 20

/**
 * 초대 후보 검색(호스트). 모집글에 지원 이력이 있는 회원 중 닉네임에 검색어가 든 회원(회원 ID 순).
 * 검색어가 비면 지원자 전체다. 이미 참여 중인 회원은 빠진다
 */
export const inviteCandidatesQuery = (chatRoomId: number, keyword: string) =>
  infiniteQueryOptions({
    queryKey: chatKeys.candidates(chatRoomId, keyword),
    queryFn: ({ pageParam, signal }) =>
      api<ChatInviteCandidatePage>(`/chats/${chatRoomId}/invite-candidates`, {
        query: {
          keyword: keyword || undefined,
          cursor: pageParam ?? undefined,
          size: CHAT_CANDIDATE_PAGE_SIZE,
        },
        signal,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/**
 * 여러 명 초대(호스트). 회원별로 참여·이미 참여 중·실패(사유)를 돌려준다.
 * requestId는 멱등 키다. 응답을 받지 못해 같은 초대를 다시 보낼 때는 같은 값을, 새 초대는 새 값을 쓴다
 */
export function inviteChatMembers(
  chatRoomId: number,
  requestId: string,
  userIds: number[],
) {
  return api<ChatInviteResponse>(`/chats/${chatRoomId}/members`, {
    method: 'POST',
    body: { requestId, userIds },
  })
}

/** 내보내기(호스트). 대상의 참여 세대를 보내 옛 요청이 재초대된 새 참여를 끝내지 않게 한다 */
export function kickChatMember(
  chatRoomId: number,
  userId: number,
  participationVersion: number,
) {
  return api<void>(`/chats/${chatRoomId}/members/${userId}`, {
    method: 'DELETE',
    query: { participationVersion },
  })
}

/** 폐쇄(호스트). 방은 읽기 전용이 되고 30일 뒤 참여자 조회가 끝난다 */
export function closeChatGroup(chatRoomId: number) {
  return api<ChatGroupCloseResponse>(`/chats/${chatRoomId}/close`, {
    method: 'POST',
  })
}
