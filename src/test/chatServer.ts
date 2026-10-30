import type { ChatMessage } from '@/entities/chat/types'
import {
  NOTIFICATIONS_QUEUE,
  PARTICIPATION_VERSION_HEADER,
  type RoomActivity,
  roomTopic,
} from '@/features/chat/receipt/contract'
import type { FakeStompClient } from './fakeStomp'
import { ME_ID } from './renderApp'

/** 내가 보낸 메시지의 결과 큐 */
export const MY_MESSAGES = '/user/queue/chats/messages'

/**
 * 서버가 새 메시지를 이 세션에 보내는 것을 흉내 낸다(방 topic 전달 모델).
 * - 이 세션이 그 방 topic을 구독 중이면 방 topic으로 보낸다
 * - 구독하지 않은 방이면 새 메시지 알림(ROOM_ACTIVITY) 한 건으로 보낸다(보낸 사람이 나면 보내지 않는다)
 * - 내가 보낸 메시지면 내 결과 큐로도 보낸다
 * headers는 STOMP 수신 메타데이터(참여 세대 등)다. 알림은 세대를 본문에 싣는다.
 */
export function deliver(
  client: FakeStompClient,
  message: ChatMessage,
  headers: Record<string, string> = {},
) {
  const topic = roomTopic(message.chatRoomId)
  const mine = message.senderUserId === ME_ID
  if (client.liveOn(topic).length > 0) client.push(topic, message, headers)
  else if (!mine) pushActivity(client, message, headers)
  if (mine) client.push(MY_MESSAGES, message, headers)
}

/** 구독하지 않은 방의 새 메시지 알림 한 건(메시지 하나를 묶은 것) */
export function pushActivity(
  client: FakeStompClient,
  message: ChatMessage,
  headers: Record<string, string> = {},
  patch: Partial<RoomActivity> = {},
) {
  const version = Number(headers[PARTICIPATION_VERSION_HEADER])
  client.push(NOTIFICATIONS_QUEUE, {
    type: 'ROOM_ACTIVITY',
    chatRoomId: message.chatRoomId,
    participationVersion: Number.isInteger(version) ? version : undefined,
    lastSequence: message.roomSequence,
    messageCount: 1,
    lastMessage: message,
    ...patch,
  })
}

/** 이 방 topic의 살아 있는 구독(없으면 undefined) */
export function roomSubscription(client: FakeStompClient, chatRoomId: number) {
  return client.liveOn(roomTopic(chatRoomId)).at(-1)
}
