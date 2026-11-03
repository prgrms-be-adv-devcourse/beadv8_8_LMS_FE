import { create } from 'zustand'
import type { ChatMessage } from '@/entities/chat/types'

/**
 * 메시지별 안 읽은 사람 수(BE 계약 (g) `contracts/unread-count.md`, #615).
 * 값은 줄기만 한다(읽음 위치는 오르기만 하고, 나가기·강퇴는 사람을 빼고, 늦은 초대·재입장은 가시 범위가 그 뒤다).
 * 그래서 같은 메시지는 어디서 받았든(이력·새 메시지 프레임·READ_COUNTS) 가진 값과 새 값 중 작은 값을 남긴다.
 * 도착 순서·중복·늦은 프레임과 옛 스냅샷의 이력 재조회도 이것으로 안전하다(버전으로 덮어쓰지 않는다).
 * 참여 세대가 바뀌면 그 방의 값을 버린다(이력 캐시를 버릴 때 함께).
 */

/** 방별 순번 → 지금까지 본 가장 작은 값 */
type ReadCountState = { rooms: Record<number, Record<number, number>> }

const useReadCountStore = create<ReadCountState>(() => ({ rooms: {} }))

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** 이 방의 값들을 작은 값으로 합친다. 바뀐 것이 있을 때만 상태를 바꾼다 */
function lower(chatRoomId: number, entries: [number, number][]) {
  if (entries.length === 0) return
  const room = useReadCountStore.getState().rooms[chatRoomId] ?? {}
  let next: Record<number, number> | null = null
  for (const [sequence, count] of entries) {
    const known = (next ?? room)[sequence]
    if (known !== undefined && known <= count) continue
    next ??= { ...room }
    next[sequence] = count
  }
  if (next)
    useReadCountStore.setState((s) => ({
      rooms: { ...s.rooms, [chatRoomId]: next },
    }))
}

/** 받은 메시지들(이력·실시간)의 값을 기록한다. 값이 없는 메시지(안내·알림, 값을 보내기 전 서버)는 건너뛴다 */
export function recordMessageCounts(
  chatRoomId: number,
  messages: ChatMessage[],
) {
  lower(
    chatRoomId,
    messages.flatMap((m) =>
      m.messageType === 'TEXT' && isCount(m.unreadMemberCount)
        ? [[m.roomSequence, m.unreadMemberCount] as [number, number]]
        : [],
    ),
  )
}

/** 방 topic의 갱신 프레임(`chat-frame-type: READ_COUNTS`) */
export type ReadCountsFrame = {
  type: 'READ_COUNTS'
  roomId: number
  readCountVersion: number
  /** 이 프레임이 다루는 첫 순번(방의 마지막 100개 시작과 내 가시 범위 시작 중 큰 값) */
  fromSequence: number
  /** 이 프레임이 다루는 끝 순번(센 때의 방 마지막 순번). 그 뒤에 온 메시지는 건드리지 않는다 */
  toSequence: number
  /** 구간 안 일반 메시지 중 값이 0보다 큰 것만(순번 오름차순) */
  counts: { roomSequence: number; unreadMemberCount: number }[]
}

/** 형식이 맞는 갱신 프레임인지. 틀리면 적용하지 않는다(값은 이력을 다시 읽을 때 맞춰진다) */
export function isReadCountsFrame(body: unknown): body is ReadCountsFrame {
  if (typeof body !== 'object' || body === null) return false
  const f = body as Partial<ReadCountsFrame>
  return (
    f.type === 'READ_COUNTS' &&
    Number.isInteger(f.roomId) &&
    Number.isInteger(f.fromSequence) &&
    Number.isInteger(f.toSequence) &&
    f.fromSequence! <= f.toSequence! &&
    Array.isArray(f.counts) &&
    f.counts.every(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        Number.isInteger(c.roomSequence) &&
        isCount(c.unreadMemberCount),
    )
  )
}

/**
 * 갱신 프레임을 적용한다. 구간 [fromSequence, toSequence] 안의 아는 일반 메시지는 목록의 값으로, 목록에 없으면 0으로
 * 낮춘다. 구간 밖과 아직 받지 않은 순번은 건드리지 않는다(받으면 그 메시지의 값으로 기록한다)
 */
export function applyReadCountsFrame(
  frame: ReadCountsFrame,
  knownMessages: ChatMessage[],
) {
  const listed = new Map(
    frame.counts.map((c) => [c.roomSequence, c.unreadMemberCount]),
  )
  lower(
    frame.roomId,
    knownMessages.flatMap((m) =>
      m.messageType === 'TEXT' &&
      m.roomSequence >= frame.fromSequence &&
      m.roomSequence <= frame.toSequence
        ? [
            [m.roomSequence, listed.get(m.roomSequence) ?? 0] as [
              number,
              number,
            ],
          ]
        : [],
    ),
  )
}

/** 이 방의 값을 버린다(나가기·재입장 등으로 참여 세대가 바뀌어 이력 캐시를 버릴 때) */
export function discardReadCounts(chatRoomId: number) {
  if (!(chatRoomId in useReadCountStore.getState().rooms)) return
  useReadCountStore.setState((s) => {
    const rooms = { ...s.rooms }
    delete rooms[chatRoomId]
    return { rooms }
  })
}

/** 모든 방의 값을 버린다(로그아웃·회원 전환·채팅 연결 정리) */
export function clearReadCounts() {
  useReadCountStore.setState({ rooms: {} })
}

/**
 * 이 메시지 옆에 보일 안 읽은 사람 수. 메시지에 실린 값과 기록한 값 중 작은 값이고, 0이거나 값이 없으면(안내·알림,
 * 값을 아직 보내지 않는 서버) undefined(숨김)
 */
export function useUnreadMemberCount(message: ChatMessage) {
  const recorded = useReadCountStore(
    (s) => s.rooms[message.chatRoomId]?.[message.roomSequence],
  )
  if (message.messageType !== 'TEXT') return undefined
  const own = isCount(message.unreadMemberCount)
    ? message.unreadMemberCount
    : undefined
  const value =
    own === undefined
      ? recorded
      : recorded === undefined
        ? own
        : Math.min(own, recorded)
  return value ? value : undefined
}
