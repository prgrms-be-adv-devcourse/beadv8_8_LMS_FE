import type { AckResult, AckTransport, ReceiptAck } from './contract'
import { RECEIPT_POLICY } from './policy'

export type AckPolicy = {
  debounceMs: number
  maxWaitMs: number
  maxPendingCount: number
  maxPendingRooms: number
  maxRetries: number
  retryBaseMs: number
  /** 주기 대조가 다시 보내기를 다 쓴 값을 다시 여는 횟수 상한(값이 확정되거나 오르면 다시 센다) */
  maxReopenCycles: number
}

export type AckQueue = {
  /** 이 기기가 확인한 누적 위치를 내놓는다. 방·세대별로 가장 높은 값 하나로 합쳐 보낸다 */
  offer: (ack: ReceiptAck) => void
  /** 기다리는 확인을 모두 지금 보낸다(pagehide·화면 숨김). 이것에만 의존하지 않고 시간 기준 전송도 돈다 */
  flushAll: () => void
  /** 방을 나가거나 지울 때 그 방의 대기·타이머를 버린다 */
  discard: (chatRoomId: number) => void
  /** 연결 종료·로그아웃 때 모두 버린다. 이후 offer는 무시한다 */
  dispose: () => void
  /** 아직 보내지 않은 확인을 들고 있는 방 수 */
  pendingRooms: () => number
  /**
   * 다시 보내기를 다 써서 멈춘 값을 다시 연다. 거절된 값은 그대로 막는다.
   * 주기 대조는 값마다 maxReopenCycles번까지만 연다(계속 실패해도 끝없이 보내지 않게). force(재연결·재동기화)는 횟수와 관계없이 연다
   */
  reopenExhausted: (options?: { force?: boolean }) => void
}

type RoomState = {
  chatRoomId: number
  participationVersion: number
  /** 서버가 ok로 확정한 값 */
  acked: number | null
  /** 서버가 거절해(drop) 다시 보내지 않을 가장 높은 값. 더 높은 값이 오면 보낸다 */
  closed: number | null
  /**
   * 다시 보내기를 다 쓴 가장 높은 값. 같은 값을 다시 내놓아도 이번 실패 연쇄 안에서는 다시 보내지 않고,
   * 다음 대조 주기·재연결·재동기화 때 reopenExhausted()로 다시 연다(회복 뒤에는 보낸다)
   */
  exhausted: number | null
  /** 주기 대조가 exhausted를 다시 연 횟수 */
  reopens: number
  /** 다시 연 값. 이 값 이하가 다시 오면 같은 실패 연쇄로 보고 횟수를 이어 센다 */
  reopenedFor: number | null
  /** 다시 보내기를 기다리기 시작한 순서(대기 방 상한에서 가장 오래된 방을 고를 때) */
  retrySince: number | null
  /** 아직 보내지 않은 가장 높은 값 */
  pending: number | null
  /** pending을 올린 offer 수(보내면 0) */
  unsentCount: number
  /** 보내지 않은 첫 offer의 순서. 가장 오래 기다린 방을 고를 때 쓴다 */
  waitingSince: number | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  maxWaitTimer: ReturnType<typeof setTimeout> | null
  /** 보내는 중인 값 */
  inFlight: number | null
  /** 다시 보내기를 기다리는 실패 값(그동안 들어온 pending과 합쳐 최신 값으로 보낸다) */
  retryValue: number | null
  retryTimer: ReturnType<typeof setTimeout> | null
  /** 이번 실패 연속에서 다시 보낸 횟수 */
  retries: number
  /** 보내는 중에 전송 조건(debounce·최대 대기·건수·flushAll)이 찼다. 끝나면 바로 보낸다 */
  flushRequested: boolean
}

/**
 * 방별 누적 수신 확인(ACK) 대기열(BE final-design 4.4 "누적 ACK 병합").
 * - 방·참여 세대별로 가장 높은 값만 남긴다. 세대가 바뀌면 옛 세대의 대기·확정 값을 버린다
 * - debounce로 모으되 maxWait 안에는 보내고, 쌓인 건수·대기 방 수가 상한을 넘으면 바로 보낸다
 * - 방마다 한 번에 하나만 보낸다. 실패하면 같은 세대의 최신 값으로 지수 대기 후 제한된 횟수만 다시 보낸다
 */
export function createAckQueue({
  transport,
  policy = RECEIPT_POLICY.ack,
  onStale,
}: {
  transport: AckTransport
  policy?: AckPolicy
  /** generationChanged: 참여 세대가 맞지 않았다(stale). false면 범위 밖(resync)이라 세대는 그대로다 */
  onStale: (chatRoomId: number, generationChanged: boolean) => void
}): AckQueue {
  const rooms = new Map<number, RoomState>()
  /** 폐기하면 진행 중인 전송을 끊는다 */
  const lifetime = new AbortController()
  let disposed = false
  let order = 0

  const max = (a: number | null, b: number | null) =>
    a === null ? b : b === null ? a : Math.max(a, b)

  const clearWaitTimers = (st: RoomState) => {
    if (st.debounceTimer !== null) clearTimeout(st.debounceTimer)
    if (st.maxWaitTimer !== null) clearTimeout(st.maxWaitTimer)
    st.debounceTimer = null
    st.maxWaitTimer = null
  }

  const clearAllTimers = (st: RoomState) => {
    clearWaitTimers(st)
    if (st.retryTimer !== null) clearTimeout(st.retryTimer)
    st.retryTimer = null
  }

  /** 보내지 않은 값을 비운다(보냈거나 확정됐거나 포기했다) */
  const clearPending = (st: RoomState) => {
    clearWaitTimers(st)
    st.pending = null
    st.unsentCount = 0
    st.waitingSince = null
  }

  const isCurrent = (st: RoomState) =>
    !disposed && rooms.get(st.chatRoomId) === st

  const send = (st: RoomState, value: number) => {
    clearPending(st)
    st.flushRequested = false
    st.inFlight = value
    const ack: ReceiptAck = {
      chatRoomId: st.chatRoomId,
      participationVersion: st.participationVersion,
      receivedSequence: value,
    }
    let result: Promise<AckResult>
    try {
      result = transport.send(ack, lifetime.signal)
    } catch {
      result = Promise.resolve('retry')
    }
    result.then(
      (r) => settle(st, value, r),
      () => settle(st, value, 'retry'),
    )
  }

  /** 전송 조건이 찼다. 보내는 중·다시 보내기 대기 중이면 끝난 뒤로 미룬다(force면 다시 보내기 대기를 건너뛴다) */
  const flushRoom = (st: RoomState, force = false) => {
    clearWaitTimers(st)
    if (st.inFlight !== null) {
      if (st.pending !== null) st.flushRequested = true
      return
    }
    if (st.retryTimer !== null) {
      if (!force) return // 다시 보내기 타이머가 최신 값으로 보낸다
      clearTimeout(st.retryTimer)
      st.retryTimer = null
      const value = max(st.retryValue, st.pending)
      st.retryValue = null
      if (value !== null) send(st, value)
      return
    }
    if (st.pending !== null) send(st, st.pending)
  }

  const settle = (st: RoomState, value: number, result: AckResult) => {
    if (!isCurrent(st)) return // 버렸거나 세대가 바뀐 방의 늦은 응답
    st.inFlight = null
    switch (result) {
      case 'ok': {
        st.acked = max(st.acked, value)
        st.exhausted = null
        st.reopens = 0
        st.reopenedFor = null
        st.retries = 0
        if (
          st.pending !== null &&
          st.acked !== null &&
          st.pending <= st.acked
        ) {
          clearPending(st)
        }
        break
      }
      case 'stale':
      case 'resync': {
        clearAllTimers(st)
        rooms.delete(st.chatRoomId)
        onStale(st.chatRoomId, result === 'stale')
        return
      }
      case 'drop': {
        st.retries = 0
        st.closed = max(st.closed, value)
        break
      }
      default: {
        // retry: 같은 세대의 최신 값으로 제한해 다시 보낸다
        if (st.retries >= policy.maxRetries) {
          // 이번 실패 연쇄는 포기한다. 더 높은 값이 오거나 reopenExhausted()가 다시 열면 보낸다.
          st.retries = 0
          st.flushRequested = false
          st.exhausted = max(st.exhausted, max(value, st.pending))
          clearPending(st)
          return
        }
        const delay = policy.retryBaseMs * 2 ** st.retries
        st.retries += 1
        st.retryValue = value
        st.retrySince = order++
        st.retryTimer = setTimeout(() => {
          st.retryTimer = null
          st.retrySince = null
          const latest = max(st.retryValue, st.pending)
          st.retryValue = null
          if (latest !== null && isCurrent(st)) send(st, latest)
        }, delay)
        // 다시 보내기를 기다리는 방도 대기 방 상한에 든다.
        enforceRoomLimit()
        return
      }
    }
    if (st.flushRequested && st.pending !== null) send(st, st.pending)
    st.flushRequested = false
  }

  /**
   * 미확인 값을 들고 있는 방(보내지 않은 값·다시 보내기 대기)이 상한을 넘으면 줄인다.
   * 1) 바로 보낼 수 있는 방은 가장 오래 기다린 방부터 보낸다
   * 2) 없으면 가장 오래 다시 보내기를 기다린 방의 재시도를 멈추고 소진으로 둔다(다음 대조가 다시 연다)
   * 3) 그래도 넘으면 보내는 중인 방의 대기 값을 버린다(확정 전이므로 다음 대조가 다시 계산해 내놓는다)
   */
  const enforceRoomLimit = () => {
    const older = (a: RoomState | null, at: number | null) =>
      a === null ||
      (at ?? 0) < ((a.retryTimer !== null ? a.retrySince : a.waitingSince) ?? 0)
    for (;;) {
      let count = 0
      let ready: RoomState | null = null
      let retrying: RoomState | null = null
      let inFlight: RoomState | null = null
      for (const st of rooms.values()) {
        const retryWaiting = st.retryTimer !== null
        if (st.pending === null && !retryWaiting) continue
        count += 1
        if (retryWaiting) {
          if (older(retrying, st.retrySince)) retrying = st
        } else if (st.inFlight !== null) {
          if (older(inFlight, st.waitingSince)) inFlight = st
        } else if (older(ready, st.waitingSince)) ready = st
      }
      if (count <= policy.maxPendingRooms) return
      if (ready) flushRoom(ready)
      else if (retrying) {
        if (retrying.retryTimer !== null) clearTimeout(retrying.retryTimer)
        retrying.retryTimer = null
        retrying.retrySince = null
        retrying.exhausted = max(
          retrying.exhausted,
          max(retrying.retryValue, retrying.pending),
        )
        retrying.retryValue = null
        retrying.retries = 0
        clearPending(retrying)
      } else if (inFlight) {
        inFlight.flushRequested = false
        clearPending(inFlight)
      } else return
    }
  }

  const newRoom = (ack: ReceiptAck): RoomState => ({
    chatRoomId: ack.chatRoomId,
    participationVersion: ack.participationVersion,
    acked: null,
    closed: null,
    exhausted: null,
    reopens: 0,
    reopenedFor: null,
    retrySince: null,
    pending: null,
    unsentCount: 0,
    waitingSince: null,
    debounceTimer: null,
    maxWaitTimer: null,
    inFlight: null,
    retryValue: null,
    retryTimer: null,
    retries: 0,
    flushRequested: false,
  })

  return {
    offer(ack) {
      if (disposed || !Number.isInteger(ack.receivedSequence)) return
      let st = rooms.get(ack.chatRoomId)
      if (!st || st.participationVersion !== ack.participationVersion) {
        // 세대가 바뀌면 옛 세대의 대기·확정 값을 버린다(보내는 중이던 옛 응답은 isCurrent로 무시된다)
        if (st) clearAllTimers(st)
        st = newRoom(ack)
        rooms.set(ack.chatRoomId, st)
      }
      const value = ack.receivedSequence
      const known = max(
        max(max(st.acked, st.closed), max(st.exhausted, st.pending)),
        max(st.inFlight, st.retryValue),
      )
      if (known !== null && value <= known) return

      const room = st
      // 다시 연 값보다 높은 값은 새 실패 연쇄다: 다시 열기 횟수를 다시 센다.
      room.exhausted = null
      if (room.reopenedFor === null || value > room.reopenedFor) {
        room.reopens = 0
        room.reopenedFor = null
      }
      room.pending = value
      room.unsentCount += 1
      if (room.waitingSince === null) {
        room.waitingSince = order++
        room.maxWaitTimer = setTimeout(() => flushRoom(room), policy.maxWaitMs)
      }
      if (room.debounceTimer !== null) clearTimeout(room.debounceTimer)
      room.debounceTimer = setTimeout(() => flushRoom(room), policy.debounceMs)

      if (room.unsentCount >= policy.maxPendingCount) flushRoom(room)
      enforceRoomLimit()
    },
    flushAll() {
      if (disposed) return
      for (const st of rooms.values()) flushRoom(st, true)
    },
    discard(chatRoomId) {
      const st = rooms.get(chatRoomId)
      if (!st) return
      clearAllTimers(st)
      rooms.delete(chatRoomId)
    },
    dispose() {
      disposed = true
      lifetime.abort()
      for (const st of rooms.values()) clearAllTimers(st)
      rooms.clear()
    },
    reopenExhausted({ force = false } = {}) {
      for (const st of rooms.values()) {
        if (st.exhausted === null) continue
        if (!force && st.reopens >= policy.maxReopenCycles) continue
        if (!force) st.reopens += 1
        st.reopenedFor = max(st.reopenedFor, st.exhausted)
        st.exhausted = null
      }
    },
    pendingRooms() {
      let count = 0
      for (const st of rooms.values()) if (st.pending !== null) count += 1
      return count
    },
  }
}
