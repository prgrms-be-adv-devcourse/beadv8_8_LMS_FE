import { RECEIPT_POLICY } from './policy'

export type ReconcilePolicy = {
  intervalMs: number
  jitterRatio: number
  maxConcurrentRooms: number
}

export type ReconcileScheduler = {
  /** 주기적 대조를 시작한다. 시작 직후에는 돌지 않는다(바로 필요하면 trigger(null)) */
  start: () => void
  /** 타이머와 대기 중인 대조를 버린다. 진행 중인 대조는 끝나게 두되 이어서 새로 돌리지 않는다 */
  stop: () => void
  /**
   * 지금 대조한다. null이면 방 목록과 대조 대상 방 전체, 방 ID면 방 목록과 그 방. 시작 전·멈춘 뒤에는 무시한다.
   * 방 대조는 방 목록 대조가 끝난 뒤(실패·시간 초과 포함) 시작한다
   */
  trigger: (chatRoomId: number | null) => void
  /** 방 목록만 지금 대조한다(이력을 불러 두지 않은 방의 순번 간격 등) */
  triggerRooms: () => void
}

/**
 * 연결 중 방 목록과 열어 둔 방의 이력을 주기적으로 대조한다(BE final-design 4.4 "기기별 이력 복구").
 * 마지막 메시지만 유실되거나 재동기화 신호까지 유실돼도 이 주기로 수렴한다.
 * - 주기마다 intervalMs × (1 + jitterRatio × random())만큼 기다린다(setTimeout을 이어 건다)
 * - 같은 대조가 진행 중이면 겹쳐 돌리지 않고, 끝난 뒤 한 번만 더 돌린다
 * - 방 대조는 방 목록 대조가 끝난 뒤 시작한다(재동기화 계약 (e)의 순서). 대조로 채운 메시지를 읽음 처리한 뒤에
 *   읽음 전에 만들어진 방 목록 응답이 도착해 안 읽은 수를 되살리지 않게
 * - 방 대조는 동시에 maxConcurrentRooms개까지만 돌린다
 * - 대조 실패는 삼키고 다음 주기를 그대로 돈다
 */
export function createReconcileScheduler({
  policy = RECEIPT_POLICY.reconcile,
  rooms,
  runRooms,
  runRoom,
  random = Math.random,
}: {
  policy?: ReconcilePolicy
  /** 대조할 방(열어 둔 방) */
  rooms: () => number[]
  /** 방 목록 대조 */
  runRooms: () => Promise<void>
  runRoom: (chatRoomId: number) => Promise<void>
  random?: () => number
}): ReconcileScheduler {
  let active = false
  let timer: ReturnType<typeof setTimeout> | null = null

  /** 진행 중인 방 목록 대조와, 그 뒤에 한 번 더 돌릴 대조(진행 중에 온 요청을 하나로 합친다) */
  let roomsRun: Promise<void> | null = null
  let roomsNext: Promise<void> | null = null
  /** stop 때마다 오른다. 멈추기 전에 예약한 다시 돌리기·방 대조는 돌리지 않는다 */
  let epoch = 0

  /** 대기 중이거나 진행 중인 방. 진행 중에 다시 요청되면 rerun을 켠다 */
  const roomStates = new Map<number, { running: boolean; rerun: boolean }>()
  const queue: number[] = []
  let runningCount = 0

  /** 동기 예외도 거부된 Promise로 바꾼다 */
  const safely = (run: () => Promise<void>): Promise<void> => {
    try {
      return Promise.resolve(run())
    } catch (error) {
      return Promise.reject(error)
    }
  }

  const startRooms = () => {
    const run: Promise<void> = safely(runRooms)
      .catch(() => {})
      .finally(() => {
        if (roomsRun === run) roomsRun = null
      })
    roomsRun = run
    return run
  }

  /** 방 목록 대조를 요청한다. 이 요청 뒤에 시작한 대조가 끝나면(실패 포함) 풀린다 */
  const requestRooms = (): Promise<void> => {
    if (!active) return Promise.resolve()
    if (!roomsRun) return startRooms()
    // 진행 중인 대조는 이 요청보다 먼저 만들어진 응답일 수 있어, 끝난 뒤 한 번 더 돌린다.
    if (!roomsNext) {
      const at = epoch
      const next: Promise<void> = roomsRun.then(() => {
        // 멈췄다 다시 시작했으면 이 예약은 떼어졌고, 그 뒤의 새 예약을 지우지 않는다.
        if (roomsNext === next) roomsNext = null
        if (!active || epoch !== at) return
        // 그사이 다른 요청이 새로 시작했으면 그 대조를 기다린다.
        return roomsRun ?? startRooms()
      })
      roomsNext = next
    }
    return roomsNext
  }

  /**
   * 그사이 다른 요청이 합쳐 예약한 방 목록 대조가 있으면 그 한 번까지만 기다린다. 그 뒤에도 요청이 이어져도 더 기다리지
   * 않는다(방 목록 요청이 계속 들어와도 방 대조가 굶지 않게). 겹친 방 목록 응답이 읽음 뒤의 안 읽은 수를 되살리는 경우는
   * 읽음 처리(useMarkRoomRead)가 바로잡는다
   */
  const roomsSettled = async () => {
    const next = roomsNext ?? roomsRun
    if (next) await next
  }

  /**
   * 방 목록 대조가 끝난 뒤 run을 돌린다. 그사이 다른 요청이 방 목록 대조를 더 예약했으면 그 한 번까지 기다린다.
   * 그사이 멈췄으면 돌리지 않는다
   */
  const afterRooms = (run: () => void) => {
    const at = epoch
    void requestRooms()
      .then(roomsSettled)
      .then(() => {
        if (active && epoch === at) run()
      })
  }

  const pump = () => {
    while (
      active &&
      runningCount < policy.maxConcurrentRooms &&
      queue.length > 0
    ) {
      const chatRoomId = queue.shift() as number
      const state = roomStates.get(chatRoomId)
      if (!state) continue
      state.running = true
      runningCount += 1
      safely(() => runRoom(chatRoomId))
        .catch(() => {})
        .finally(() => {
          runningCount -= 1
          roomStates.delete(chatRoomId)
          if (state.rerun) requestRoom(chatRoomId)
          pump()
        })
    }
  }

  const requestRoom = (chatRoomId: number) => {
    if (!active) return
    const state = roomStates.get(chatRoomId)
    if (state) {
      // 대기 중이면 그대로 두고(돌 때 최신 상태로 돈다), 진행 중이면 끝난 뒤 한 번 더
      if (state.running) state.rerun = true
      return
    }
    roomStates.set(chatRoomId, { running: false, rerun: false })
    queue.push(chatRoomId)
    pump()
  }

  const runCycle = () =>
    afterRooms(() => {
      let ids: number[] = []
      try {
        ids = rooms()
      } catch {
        ids = []
      }
      for (const id of ids) requestRoom(id)
    })

  const scheduleNext = () => {
    if (!active) return
    const delay = policy.intervalMs * (1 + policy.jitterRatio * random())
    timer = setTimeout(() => {
      timer = null
      runCycle()
      scheduleNext()
    }, delay)
  }

  return {
    start() {
      if (active) return
      active = true
      scheduleNext()
    },
    stop() {
      active = false
      epoch += 1
      // 멈추기 전 예약은 돌지 않고 끝난다. 다시 시작한 뒤의 요청이 그 예약을 받아 새 방 목록 대조 없이 방 대조로 넘어가지 않게 뗀다.
      roomsNext = null
      if (timer !== null) clearTimeout(timer)
      timer = null
      // 아직 시작하지 않은 방 대조는 버리고, 진행 중인 방은 다시 돌리지 않는다
      queue.length = 0
      for (const [id, state] of roomStates) {
        if (state.running) state.rerun = false
        else roomStates.delete(id)
      }
    },
    trigger(chatRoomId) {
      if (!active) return
      if (chatRoomId === null) {
        runCycle()
        return
      }
      afterRooms(() => requestRoom(chatRoomId))
    },
    triggerRooms() {
      void requestRooms()
    },
  }
}
