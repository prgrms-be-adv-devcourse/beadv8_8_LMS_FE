import type { ChatMessagePage } from '@/entities/chat/types'

/**
 * 이번 참여 세대에서 내가 볼 수 있는 범위의 시작. 서버가 "더 오래된 메시지 없음(nextCursor=null)"으로 알려 준 지점이다.
 * 재입장 전 메시지처럼 보이지 않는 순번은 이 앞에 있으므로 누락으로 세지 않는다.
 */
export const BEGIN = 'BEGIN'

export type RangeStart = number | typeof BEGIN

/** 양 끝을 포함하는 roomSequence 구간 */
export type CoveredRange = { from: RangeStart; to: number }

/**
 * 이력 한 페이지(GET /chats/{id}/messages?cursor=)로 서버가 빠짐없음을 확인해 준 구간.
 * - to: cursor 없이 받은 최신 페이지면 페이지의 가장 큰 순번, 아니면 cursor - 1(cursor는 "이 순번 미만")
 * - from: nextCursor가 null이면 가시 범위의 시작(BEGIN), 아니면 페이지의 가장 작은 순번
 * 빈 최신 페이지는 아무것도 알려 주지 않으므로 null이다(방이 비어 있어도 높은 순번을 추정하지 않는다).
 */
export function coverageOfPage(
  page: ChatMessagePage,
  cursor: number | null,
): CoveredRange | null {
  const { messages, nextCursor } = page
  if (messages.length === 0) {
    if (cursor !== null && nextCursor === null) {
      return { from: BEGIN, to: cursor - 1 }
    }
    return null
  }
  let min = Infinity
  let max = -Infinity
  for (const { roomSequence } of messages) {
    if (roomSequence < min) min = roomSequence
    if (roomSequence > max) max = roomSequence
  }
  return {
    from: nextCursor === null ? BEGIN : min,
    to: cursor === null ? max : cursor - 1,
  }
}

/** 확정 위치에 아직 이어지지 않은 구간을 이만큼만 들고 있는다. 넘치면 가장 높은 구간부터 버린다(최신 페이지 대조로 다시 얻는다) */
const MAX_DETACHED_RANGES = 256

type Range = { from: number; to: number }

/**
 * 한 방·한 참여 세대에서 이 기기가 빠짐없이 확인한 순번 구간.
 * BEGIN부터 끊김 없이 이어진 끝(confirmed)만 누적 ACK로 보낼 수 있다. 높은 순번 하나가 도착했다고 그 앞까지 확인한 것으로 보지 않는다.
 */
export class RoomCoverage {
  #confirmed: number | null = null
  /** confirmed + 1보다 뒤에서 시작하는 구간. from 오름차순, 서로 겹치거나 맞닿지 않는다 */
  #ranges: Range[] = []

  /** 서버 이력 대조로 확인한 구간을 더한다. from이 BEGIN이면 가시 범위 시작부터 to까지다 */
  addRange(from: RangeStart, to: number): void {
    if (!Number.isInteger(to)) return
    if (from === BEGIN) {
      this.#advanceTo(to)
      return
    }
    if (!Number.isInteger(from) || from > to) return
    if (this.#confirmed !== null && from <= this.#confirmed + 1) {
      this.#advanceTo(to)
      return
    }
    this.#insert({ from, to })
  }

  /** 실시간으로 받아 반영한 메시지 하나 */
  addPoint(seq: number): void {
    this.addRange(seq, seq)
  }

  /** BEGIN부터 끊김 없이 확인한 마지막 순번. BEGIN에 닿은 구간이 없으면 null이다. 줄어들지 않는다 */
  confirmed(): number | null {
    return this.#confirmed
  }

  /** 확정 위치에 아직 이어지지 않은 구간(오름차순). 이어 읽을 cursor를 고르거나 진단할 때 쓴다 */
  detachedRanges(): readonly Readonly<Range>[] {
    return this.#ranges.map((r) => ({ ...r }))
  }

  #advanceTo(to: number): void {
    let confirmed =
      this.#confirmed === null ? to : Math.max(this.#confirmed, to)
    // 이어 붙는 구간을 흡수하고, 확정 위치 아래로 들어간 구간은 버린다
    while (this.#ranges.length > 0 && this.#ranges[0].from <= confirmed + 1) {
      confirmed = Math.max(confirmed, this.#ranges[0].to)
      this.#ranges.shift()
    }
    this.#confirmed = confirmed
  }

  #insert(range: Range): void {
    const merged: Range[] = []
    let current = range
    let placed = false
    for (const r of this.#ranges) {
      if (r.to + 1 < current.from) {
        merged.push(r)
      } else if (current.to + 1 < r.from) {
        if (!placed) {
          merged.push(current)
          placed = true
        }
        merged.push(r)
      } else {
        current = {
          from: Math.min(current.from, r.from),
          to: Math.max(current.to, r.to),
        }
      }
    }
    if (!placed) merged.push(current)
    if (merged.length > MAX_DETACHED_RANGES) merged.length = MAX_DETACHED_RANGES
    this.#ranges = merged
  }
}

/** 회원·방별 확인 구간. 참여 세대가 바뀌면 이전 세대의 확인 위치를 버리고 새로 시작한다 */
export type ReceiptLedger = {
  /** 이 회원·방·참여 세대의 확인 구간(없으면 만든다). 저장된 세대와 다르면 버리고 새로 만든다 */
  forRoom: (
    userId: number,
    chatRoomId: number,
    participationVersion: number,
  ) => RoomCoverage
  /** 만들지 않고 지금 들고 있는 확인 구간만 본다 */
  peek: (
    userId: number,
    chatRoomId: number,
  ) => { participationVersion: number; coverage: RoomCoverage } | undefined
  /** 방을 나가거나 목록에서 사라졌을 때 그 방의 확인 구간을 모두 버린다 */
  discardRoom: (chatRoomId: number) => void
  /** 로그아웃·회원 전환 때 모두 버린다 */
  clear: () => void
}

export function createReceiptLedger(): ReceiptLedger {
  type Entry = {
    chatRoomId: number
    participationVersion: number
    coverage: RoomCoverage
  }
  const entries = new Map<string, Entry>()
  const keyOf = (userId: number, chatRoomId: number) =>
    `${userId}:${chatRoomId}`

  return {
    forRoom(userId, chatRoomId, participationVersion) {
      const key = keyOf(userId, chatRoomId)
      const existing = entries.get(key)
      if (existing && existing.participationVersion === participationVersion) {
        return existing.coverage
      }
      const coverage = new RoomCoverage()
      entries.set(key, { chatRoomId, participationVersion, coverage })
      return coverage
    },
    peek(userId, chatRoomId) {
      const entry = entries.get(keyOf(userId, chatRoomId))
      return entry
        ? {
            participationVersion: entry.participationVersion,
            coverage: entry.coverage,
          }
        : undefined
    },
    discardRoom(chatRoomId) {
      for (const [key, entry] of entries) {
        if (entry.chatRoomId === chatRoomId) entries.delete(key)
      }
    },
    clear() {
      entries.clear()
    },
  }
}
