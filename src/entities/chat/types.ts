/** 메시지 본문 최대 길이(글자 수, UTF-16 단위). BE 제한과 같다 */
export const CHAT_MESSAGE_MAX_LENGTH = 2000
/** 이 길이를 넘으면 입력창 아래에 남은 글자 수를 보여 준다 */
export const CHAT_MESSAGE_COUNT_FROM = 1800

/**
 * 방 상태
 * - 1:1 방: ACTIVE, ENDED(두 사람 모두 나감, 다시 활성화하지 않음)
 * - 단체방: ACTIVE(사용 중), SUSPENDED(호스트 일시 정지, 조회·읽음·나가기만), READ_ONLY(폐쇄·호스트 운영 불가, 조회 만료 전까지
 *   조회·읽음·나가기만), EXPIRED(조회 기간 끝남, 관리자 기록에만 나온다)
 */
export type ChatRoomStatus =
  'ACTIVE' | 'ENDED' | 'SUSPENDED' | 'READ_ONLY' | 'EXPIRED'

/** 1:1 방(DIRECT)과 출연 모집글의 호스트가 만드는 모집용 단체방(GROUP) */
export type ChatRoomType = 'DIRECT' | 'GROUP'

/**
 * TEXT: 회원이 보낸 메시지, SYSTEM: 서버가 남긴 안내(예: "{닉네임}님이 나갔습니다."),
 * NOTIFICATION: 출연 모듈 이벤트로 남긴 알림(예: 출연 요청 도착). 보낸 사람은 출연 건의 행위자다
 */
export type ChatMessageType = 'TEXT' | 'SYSTEM' | 'NOTIFICATION'

/**
 * 알림(NOTIFICATION)·단체방 안내(SYSTEM)의 종류
 * - APPEARANCE_REQUEST_SENT: 출연 요청 도착(게스트가 받음). referenceId = 요청서 ID
 * - APPEARANCE_APPLICATION_SUBMITTED: 출연 모집 지원 도착(호스트가 받음). referenceId = 지원 ID, parentReferenceId = 모집글 ID
 * - GROUP_으로 시작: 단체방 안내. 서버는 종류와 행위자·대상 회원 ID만 남기고 FE가 문구를 만든다. 보낸 사람이 행위자다
 *   - GROUP_MEMBERS_INVITED(초대), GROUP_MEMBER_KICKED(내보내기), GROUP_MEMBER_LEFT(나가기), GROUP_ROOM_CLOSED(폐쇄)
 *   - GROUP_HOST_UNAVAILABLE(호스트가 방을 운영할 수 없게 됨), GROUP_ROOM_SUSPENDED(일시 중지), GROUP_ROOM_RESUMED(재개):
 *     서버가 전환 기능을 만들 때 남기기 시작한다(값 필드 없음)
 */
export type NotificationKind =
  | 'APPEARANCE_REQUEST_SENT'
  | 'APPEARANCE_APPLICATION_SUBMITTED'
  | 'GROUP_MEMBERS_INVITED'
  | 'GROUP_MEMBER_KICKED'
  | 'GROUP_MEMBER_LEFT'
  | 'GROUP_ROOM_CLOSED'
  | 'GROUP_HOST_UNAVAILABLE'
  | 'GROUP_ROOM_SUSPENDED'
  | 'GROUP_ROOM_RESUMED'

/** 알림 문구 값(종류별 형식). 모르는 키도 들어올 수 있다 */
export type NotificationValues = Record<string, unknown>

/** 알림 메시지에만 값이 있다. 다른 메시지는 null */
export type NotificationFields = {
  notificationKind?: NotificationKind | null
  referenceId?: number | null
  /** 상위 출연 건 ID(지원 알림의 모집글 ID). BE #232 전에 남은 알림은 null */
  parentReferenceId?: number | null
  /**
   * 알림 종류별 문구 값(형식 버전 v). 알림 종류에 맞는 필드 하나만 채워지고 나머지는 null이다. 값이 있으면 서버는
   * 문구(content)를 비워 두고 FE가 템플릿으로 만든다. 형식은 notification.ts의 템플릿이 확인한다
   */
  appearanceRequestSent?: NotificationValues | null
  appearanceApplicationSubmitted?: NotificationValues | null
  /** 단체방 안내의 값. { v, inviterUserId, invitedUserIds } */
  groupMembersInvited?: NotificationValues | null
  /** { v, kickedByUserId, kickedUserId } */
  groupMemberKicked?: NotificationValues | null
  /** { v, leftUserId } */
  groupMemberLeft?: NotificationValues | null
  /** { v, closedByUserId } */
  groupRoomClosed?: NotificationValues | null
}

export type ChatRoomMember = {
  userId: number
  nickname: string
  /** 참여 중이면 true, 나갔으면 false */
  active: boolean
  /** 참여 세대. 나가기 요청에 함께 보내 지연된 옛 요청이 새 참여를 끝내지 않게 한다 */
  participationVersion: number
}

/**
 * 단체방 정보(1:1 방은 null). 방 목록·상세는 참여자를 싣지 않고 인원과 내 참여 세대만 싣는다(참여자는 GET /{id}/members).
 * 일시는 KST, 오프셋 없는 문자열이다
 */
export type ChatGroupSummary = {
  recruitId: number
  /** 호스트 회원 ID. 메시지의 보낸 사람과 같으면 왕관을 표시한다 */
  hostUserId: number
  /** 모집글 제목(생성 때 복사, 초대 후보 검색 때 갱신) */
  title: string
  /** 읽기 전용 사유(호스트 폐쇄·호스트 운영 불가). 사용 중·일시 중지면 null */
  statusReason: ChatGroupStatusReason | null
  /** 읽기 전용 전환 시각 */
  readOnlyAt: string | null
  /** 참여자 조회 만료 시각(전환 + 30일). 이 시각부터 볼 수 없다 */
  historyExpiresAt: string | null
  /** 호스트를 포함한 참여자 수 */
  memberCount: number
  /** 게스트 정원(호스트 제외) */
  maxGuestMembers: number
  /** 내 현재 참여 세대. 구독·읽음·수신 확인·나가기에 쓴다. 관리자 기록 조회에서는 null */
  myParticipationVersion: number | null
}

/** CLOSED_BY_HOST: 호스트가 폐쇄함(호스트도 나갈 수 있다), HOST_UNAVAILABLE: 호스트가 방을 운영할 수 없게 됨 */
export type ChatGroupStatusReason = 'CLOSED_BY_HOST' | 'HOST_UNAVAILABLE'

/** GET /chats 한 줄, POST /chats·POST /chats/groups 응답 */
export type ChatRoom = {
  chatRoomId: number
  roomType: ChatRoomType
  status: ChatRoomStatus
  createdAt: string
  /** 1:1 방의 참여자(나간 상대 포함). 단체방은 빈 목록이다 */
  members: ChatRoomMember[]
  /** 내가 볼 수 있는 가장 최근 메시지. 없으면 null (BE #197 전에는 필드 없음) */
  lastMessage?: ChatMessage | null
  /** 내가 안 읽은 상대 메시지 수(시스템 안내 포함) (BE #197 전에는 필드 없음) */
  unreadCount?: number
  /** 단체방 정보. 1:1 방은 null(전환 전 서버는 필드 없음) */
  group?: ChatGroupSummary | null
}

/** GET /chats/groups?recruitId= : 모집글의 단체방 중 내가 볼 수 있는 방 */
export type ChatGroupRooms = {
  recruitId: number
  /** 현재 방(사용 중·일시 중지). 없거나 내가 참여 중이 아니면 null */
  currentRoom: ChatRoom | null
  /** 읽기 전용으로 남은 이전 방(최근 방부터). 나간 방·조회 만료된 방은 빠진다 */
  previousRooms: ChatRoom[]
}

/** GET /chats/{id}/members 한 페이지(참여 순, 참여 중인 회원만) */
export type ChatRoomMemberPage = {
  members: ChatRoomMember[]
  nextCursor: number | null
}

/**
 * 초대 실패 사유. 실패한 회원은 참여하지 않고 후보 검색에 다시 나온다
 * - NOT_APPLICANT: 모집글에 지원 이력이 없음, CHAT_NOT_ALLOWED: 지금 채팅할 수 없는 회원, ROOM_FULL: 정원이 참
 */
export type ChatInviteFailure =
  'NOT_APPLICANT' | 'CHAT_NOT_ALLOWED' | 'ROOM_FULL'

/** 초대 후보 한 명. 화면에는 닉네임만 보이고 초대는 회원 ID로 지정한다 */
export type ChatInviteCandidate = {
  userId: number
  nickname: string
  /** 지금 초대할 수 있는지 */
  invitable: boolean
  /** 초대할 수 없는 사유. 초대할 수 있으면 null */
  reason: ChatInviteFailure | null
}

/** GET /chats/{id}/invite-candidates 한 페이지(회원 ID 순). 이미 참여 중인 회원은 빠진다 */
export type ChatInviteCandidatePage = {
  candidates: ChatInviteCandidate[]
  nextCursor: number | null
  /** 지금 남은 게스트 자리 수 */
  remainingGuestSlots: number
}

/** 초대의 회원 한 명 결과. JOINED: 참여함, ALREADY_MEMBER: 이미 참여 중, FAILED: 참여하지 못함(reason) */
export type ChatInviteOutcome = {
  userId: number
  result: 'JOINED' | 'ALREADY_MEMBER' | 'FAILED'
  reason: ChatInviteFailure | null
}

/** POST /chats/{id}/members. 일부가 실패해도 200이다. 같은 requestId의 재시도는 저장한 결과를 그대로 돌려준다 */
export type ChatInviteResponse = {
  chatRoomId: number
  requestId: string
  /** 중복을 뺀 요청 순서의 회원별 결과 */
  results: ChatInviteOutcome[]
}

/** POST /chats/{id}/close */
export type ChatGroupCloseResponse = {
  chatRoomId: number
  status: ChatRoomStatus
  statusReason: ChatGroupStatusReason | null
  readOnlyAt: string | null
  historyExpiresAt: string | null
}

/**
 * 일반 메시지(TEXT)의 보낸 사람 표시 정보(채팅 회원 복제본). 나간·내보내진 회원도 닉네임이 남는다.
 * 탈퇴한 회원은 nickname '탈퇴한 회원'·withdrawn true, 복제본이 없으면 nickname null이다(FE가 '알 수 없는 회원'으로 쓴다).
 * 이력·방 목록은 조회 때의 닉네임, 실시간·전송 확인은 전달 때의 닉네임이다
 */
export type ChatMessageSender = {
  userId: number
  nickname: string | null
  withdrawn: boolean
}

/** 메시지 이력·실시간 수신(/user/queue/chats/messages) */
export type ChatMessage = NotificationFields & {
  messageId: number
  chatRoomId: number
  /** 방 단위 순번. 이력 조회 cursor로도 쓴다 */
  roomSequence: number
  senderUserId: number
  /** 보낸 사람 표시 정보. 일반 메시지(TEXT)에만 있고 안내·알림은 null(행위자는 안내 값에 있다) */
  sender?: ChatMessageSender | null
  /**
   * 안 읽은 사람 수(보낸 사람 제외, 이 메시지를 볼 수 있는 현재 참여자 중 아직 읽지 않은 사람). 일반 메시지(TEXT)의
   * 이력·새 메시지 프레임에만 있고 안내·알림·방 목록 마지막 메시지는 null이다. 1:1 방은 0 또는 1이다.
   * 값은 줄기만 하므로 같은 메시지는 작은 값을 쓴다(features/chat/readCounts). 값을 보내기 전 서버는 필드가 없다
   */
  unreadMemberCount?: number | null
  /** 그 값을 센 DB 시각(epoch 마이크로초). 진단용이며 값을 덮어쓰는 기준이 아니다 */
  readCountVersion?: number | null
  messageType: ChatMessageType
  content: string
  sentAt: string
  /**
   * 보낸 사람이 STOMP 전송에 붙인 임시 ID. 내 메시지에만 담긴다(실시간·이력·방 목록 lastMessage, BE #261).
   * 상대 메시지는 null
   */
  clientMessageId?: string | null
}

/** GET /chats/{chatRoomId}/messages. 최신순 */
export type ChatMessagePage = {
  messages: ChatMessage[]
  /** 더 오래된 메시지를 불러올 cursor. 더 없으면 null */
  nextCursor: number | null
  /** 조회한 회원의 현재 참여 세대. 전환 전 서버는 주지 않는다 */
  participationVersion?: number
  /** 조회한 회원의 가시 범위 시작 순번. 이보다 낮은 순번은 볼 수 없다 */
  visibleFromSequence?: number
  /** 이 페이지의 안 읽은 사람 수를 센 DB 시각(epoch 마이크로초, 진단용) */
  readCountVersion?: number | null
}

/** 새 메시지 알림(/user/queue/chats/notifications). 받는 사람에게만 온다 */
export type ChatNotification = {
  type: 'NEW_MESSAGE'
  chatRoomId: number
  messageId: number
  senderUserId: number
  sentAt: string
}

/** STOMP 처리 오류(/user/queue/chats/errors). 보낸 사람에게만 온다 */
export type ChatError = {
  code: string
  message: string
  /** 실패한 전송의 임시 ID. 보내지 않았거나 본문을 읽지 못했으면 null */
  clientMessageId?: string | null
}

/**
 * 입장·퇴장 기록 종류
 * - 1:1 방·단체방: ROOM_CREATED, MEMBER_JOINED(생성 때만, 단체방은 호스트), MEMBER_LEFT
 * - 1:1 방만: MEMBER_REJOINED, ROOM_ENDED(두 사람 모두 나감)
 * - 단체방만: MEMBER_INVITED·MEMBER_KICKED(호스트가 대상 회원을 초대(재초대 포함)·내보냄), ROOM_CLOSED(호스트가 폐쇄),
 *   HOST_UNAVAILABLE(호스트가 탈퇴·자격 상실로 읽기 전용), HISTORY_EXPIRED(참여자 조회 만료. 행위자는 방 주인, 시각은 만료 시각)
 */
export type ChatRoomEventType =
  | 'ROOM_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_REJOINED'
  | 'ROOM_ENDED'
  | 'MEMBER_INVITED'
  | 'MEMBER_KICKED'
  | 'ROOM_CLOSED'
  | 'HOST_UNAVAILABLE'
  | 'HISTORY_EXPIRED'

export type ChatRoomLog = {
  logId: number
  /** 기록을 남긴 회원. 방 종료처럼 시스템 기록이면 null일 수 있다 */
  actorUserId: number | null
  /**
   * 행위 대상 회원. 단체방 초대·내보내기에만 값이 있고 다른 기록은 null이다.
   * 호스트는 자신을 초대(이미 참여 중)하거나 내보낼(CANNOT_KICK_HOST) 수 없어 대상은 늘 행위자가 아닌 회원이다
   */
  targetUserId?: number | null
  eventType: ChatRoomEventType
  occurredAt: string
}

/** 관리자 기록용 메시지. 참여자에게 숨겨진 메시지와 삭제된 메시지(deletedAt)도 온다 */
export type ChatHistoryMessage = NotificationFields & {
  messageId: number
  roomSequence: number
  senderUserId: number
  messageType: ChatMessageType
  content: string
  sentAt: string
  deletedAt: string | null
}

/**
 * GET /chats/admin/{chatRoomId}/history 한 페이지 (관리자 분쟁 확인용).
 * 기록과 메시지를 하나의 시간순 흐름(시각 → 같은 시각이면 기록 먼저 → ID)으로 보고 오래된 쪽부터 커서로 나눈다.
 * 방 정보(status·members 등)는 페이지마다 같은 값이 온다
 */
export type ChatRoomHistory = {
  chatRoomId: number
  status: ChatRoomStatus
  createdAt: string
  endedAt: string | null
  members: ChatRoomMember[]
  /** 이 페이지 구간의 기록(시간순) */
  logs: ChatRoomLog[]
  /** 이 페이지 구간의 메시지(시간순) */
  messages: ChatHistoryMessage[]
  /** 다음(더 최근) 페이지 커서. 더 없으면 null (BE #263) */
  nextCursor: string | null
}

/** POST /chats/ws-tickets */
export type ChatConnectionTicket = {
  /** 한 번만, 받자마자 쓴다 */
  ticket: string
  /** 티켓 유효 시간(초) */
  expiresIn: number
  /** 이 티켓으로 연결(또는 재인증)한 연결이 닫히는 시각(ISO-8601 UTC) */
  connectionExpiresAt: string
}

/** 재인증 결과(/user/queue/chats/connection). 재인증 프레임을 보낸 연결에만 온다 */
export type ChatReauthFrame = {
  type: 'REAUTHENTICATED' | 'REAUTH_FAILED' | (string & {})
  /** 실패 사유(INVALID_TICKET·MEMBER_MISMATCH·CONNECTION_CLOSING). 성공이면 null */
  code: string | null
  /** 이 연결이 닫히는 시각. 성공이면 새 값, 실패면 바뀌지 않은 기존 값. 모르면 null */
  connectionExpiresAt: string | null
}
