/** 방 상태. 두 사람 모두 나가면 ENDED가 되고 다시 활성화하지 않는다 */
export type ChatRoomStatus = 'ACTIVE' | 'ENDED'

/** TEXT: 회원이 보낸 메시지, SYSTEM: 서버가 남긴 안내(예: "{닉네임}님이 나갔습니다.") */
export type ChatMessageType = 'TEXT' | 'SYSTEM'

export type ChatRoomMember = {
  userId: number
  nickname: string
  /** 참여 중이면 true, 나갔으면 false */
  active: boolean
  /** 참여 세대. 나가기 요청에 함께 보내 지연된 옛 요청이 새 참여를 끝내지 않게 한다 */
  participationVersion: number
}

/** GET /chats 한 줄, POST /chats 응답 */
export type ChatRoom = {
  chatRoomId: number
  roomType: 'DIRECT'
  status: ChatRoomStatus
  createdAt: string
  members: ChatRoomMember[]
  /** 내가 볼 수 있는 가장 최근 메시지. 없으면 null (BE #197 전에는 필드 없음) */
  lastMessage?: ChatMessage | null
  /** 내가 안 읽은 상대 메시지 수(시스템 안내 포함) (BE #197 전에는 필드 없음) */
  unreadCount?: number
}

/** 메시지 이력·실시간 수신(/user/queue/chats/messages) */
export type ChatMessage = {
  messageId: number
  chatRoomId: number
  /** 방 단위 순번. 이력 조회 cursor로도 쓴다 */
  roomSequence: number
  senderUserId: number
  messageType: ChatMessageType
  content: string
  sentAt: string
  /** 보낸 사람이 STOMP 전송에 붙인 임시 ID. 실시간 전달에만 있고 이력·방 목록에서는 null */
  clientMessageId?: string | null
}

/** GET /chats/{chatRoomId}/messages. 최신순 */
export type ChatMessagePage = {
  messages: ChatMessage[]
  /** 더 오래된 메시지를 불러올 cursor. 더 없으면 null */
  nextCursor: number | null
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
